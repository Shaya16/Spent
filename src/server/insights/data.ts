import "server-only";

import { getDb } from "../db/index";
import { normalizeMerchant } from "../rules/normalize";
import { detectRecurring, isActive, type Series } from "./recurring";
import { projectInstallments, type ProjectedPayment } from "./installments";
import { findAnomalies, type Anomaly } from "./anomalies";

interface Row {
  description: string;
  amount: number;
  currency: string;
  date: string;
  billingDate: string;
  account: string;
  num: number | null;
  total: number | null;
  category: string | null;
}

function loadRows(workspaceId: number): Row[] {
  return getDb()
    .prepare(
      `SELECT t.description, t.charged_amount as amount,
              COALESCE(t.charged_currency, t.original_currency) as currency,
              substr(t.date, 1, 10) as date, substr(t.processed_date, 1, 10) as billingDate,
              t.account_number as account, t.installment_number as num, t.installment_total as total,
              c.name as category
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.kind = 'expense' AND t.is_excluded = 0`
    )
    .all(workspaceId) as Row[];
}

export interface Insights {
  series: Series[];
  installments: ProjectedPayment[];
  /** Charges already made, by the billing date they will land on (upcoming dates only). */
  posted: Record<string, number>;
  anomalies: Anomaly[];
  avgDiscretionary: number;
  monthTotal: number;
  topCategories: { name: string; total: number }[];
}

function monthKey(date: string, shift: number): string {
  const [y, m] = date.split("-").map(Number);
  const idx = y * 12 + (m - 1) + shift;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function loadInsights(workspaceId: number, today: string): Insights {
  const rows = loadRows(workspaceId);
  // Scrapers store expenses negative; refunds (positive) are kept so recurring detection can ignore them.
  const norm = rows.map((r) => ({ ...r, merchant: normalizeMerchant(r.description) }));

  // Installment plans are projected separately; as monthly charges they would also look like subscriptions.
  const series = detectRecurring(
    norm
      .filter((r) => !(r.total != null && r.total > 1))
      .map((r) => ({ merchant: r.merchant, currency: r.currency, amount: r.amount, date: r.date }))
  ).filter((s) => isActive(s, today));

  const posted: Record<string, number> = {};
  for (const r of rows) {
    if (r.billingDate >= today && r.amount < 0) posted[r.billingDate] = (posted[r.billingDate] ?? 0) - r.amount;
  }
  const installments = projectInstallments(
    norm
      .filter((r) => r.num != null && r.total != null)
      .map((r) => ({
        merchant: r.merchant,
        account: r.account,
        amount: r.amount,
        number: r.num!,
        total: r.total!,
        date: r.billingDate,
      })),
    today
  );
  const anomalies = findAnomalies(
    norm.map((r) => ({ merchant: r.merchant, category: r.category ?? "Uncategorized", amount: r.amount, date: r.date })),
    today
  );

  const spent = (r: Row) => Math.max(0, -r.amount);
  const thisMonth = monthKey(today, 0);
  const prior = [-1, -2, -3].map((s) => monthKey(today, s));
  const monthRows = rows.filter((r) => r.date.slice(0, 7) === thisMonth);
  const monthTotal = monthRows.reduce((s, r) => s + spent(r), 0);

  const cats = new Map<string, number>();
  for (const r of monthRows) {
    const name = r.category ?? "Uncategorized";
    cats.set(name, (cats.get(name) ?? 0) + spent(r));
  }
  const topCategories = [...cats]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const nextMonth = monthKey(today, 1);
  const installmentsNextMonth = installments.filter((p) => p.month === nextMonth).reduce((s, p) => s + p.amount, 0);
  // shortcut: discretionary = prior 3-month mean spend minus monthly-equivalent recurring; refine once forecasts are compared with real bills.
  const priorMean = rows.filter((r) => prior.includes(r.date.slice(0, 7))).reduce((s, r) => s + spent(r), 0) / 3;
  const monthlyRecurring = series
    .filter((s) => s.status === "suggested")
    .reduce(
      (sum, s) =>
        sum + (s.cadence === "weekly" ? s.expectedAmount * 4.33 : s.cadence === "yearly" ? s.expectedAmount / 12 : s.expectedAmount),
      0
    );

  return {
    series,
    installments,
    posted,
    anomalies,
    avgDiscretionary: Math.max(0, priorMean - monthlyRecurring - installmentsNextMonth),
    monthTotal,
    topCategories,
  };
}
