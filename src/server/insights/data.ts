import "server-only";

import { getDb } from "../db/index";
import { normalizeMerchant } from "../rules/normalize";
import { addDays, israelDay, monthKey } from "../lib/date-utils";
import { isBankProvider } from "../lib/transfers";
import { usesScraperFork } from "../scrapers/select";
import { detectRecurring, isActive, type Series } from "./recurring";
import { projectInstallments, type ProjectedPayment } from "./installments";
import { findAnomalies, type Anomaly } from "./anomalies";
import { upcomingBillingDates, type CardForecastInput } from "./forecast";

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
  provider: string;
}

function loadRows(workspaceId: number): Row[] {
  return getDb()
    .prepare(
      `SELECT t.description, t.charged_amount as amount,
              COALESCE(t.charged_currency, t.original_currency) as currency,
              t.date as date, t.processed_date as billingDate,
              t.account_number as account, t.installment_number as num, t.installment_total as total,
              c.name as category, t.provider as provider
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.kind = 'expense' AND t.is_excluded = 0`
    )
    .all(workspaceId)
    // Stored dates are whatever the scraper returned (often UTC instants); bucket them by Israeli calendar day here
    // rather than rewriting them on insert, which would change dedup hashes of rows already stored.
    .map((r) => {
      const row = r as Row;
      return { ...row, date: israelDay(row.date), billingDate: israelDay(row.billingDate) };
    });
}

/** Pending card charges, net of pending refunds: not on a statement yet, so they land on each card's next bill. */
function loadPendingByAccount(workspaceId: number): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT account_number as account, charged_amount as amount, provider
       FROM transactions
       WHERE workspace_id = ? AND status = 'pending' AND kind = 'expense' AND is_excluded = 0`
    )
    .all(workspaceId) as { account: string; amount: number; provider: string }[];
  const byAccount = new Map<string, number>();
  for (const r of rows) {
    if (isBankProvider(r.provider)) continue;
    // The fork reports pending charges unsigned; the default library signs them like completed rows (refunds positive).
    const charge = usesScraperFork(r.provider) ? Math.abs(r.amount) : -r.amount;
    byAccount.set(r.account, (byAccount.get(r.account) ?? 0) + charge);
  }
  return byAccount;
}

export interface Insights {
  series: Series[];
  installments: ProjectedPayment[];
  /** Per-card inputs for forecastCards. */
  cards: CardForecastInput[];
  anomalies: Anomaly[];
  monthTotal: number;
  topCategories: { name: string; total: number }[];
}

const monthlyEquivalent = (s: Series) =>
  s.cadence === "weekly" ? s.expectedAmount * 4.33 : s.cadence === "yearly" ? s.expectedAmount / 12 : s.expectedAmount;

/** The day of month a card is billed on: the most common day among its billing dates. */
function billingDayOf(billingDates: string[], fallback: number): number {
  const counts = new Map<number, number>();
  for (const d of billingDates) {
    const day = Number(d.slice(8, 10));
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [day, n] of counts) if (n > bestCount) [best, bestCount] = [day, n];
  return best;
}

export function loadInsights(workspaceId: number, today: string, fallbackBillingDay = 10): Insights {
  const rows = loadRows(workspaceId);
  // Scrapers store expenses negative; refunds (positive) are kept so recurring detection can ignore them.
  const norm = rows.map((r) => ({ ...r, merchant: normalizeMerchant(r.description) }));

  // Installment plans are projected separately; as monthly charges they would also look like subscriptions.
  const series = detectRecurring(
    norm
      .filter((r) => !(r.total != null && r.total > 1))
      .map((r) => ({ merchant: r.merchant, account: r.account, currency: r.currency, amount: r.amount, date: r.date }))
  ).filter((s) => isActive(s, today));

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
  const nextMonth = monthKey(today, 1);
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

  const pending = loadPendingByAccount(workspaceId);
  // Only cards have bills; bank-account debits are spending but not part of a card forecast.
  const cardRows = rows.filter((r) => !isBankProvider(r.provider));
  const accounts = [...new Set([...cardRows.map((r) => r.account), ...pending.keys()])].sort();
  const cards: CardForecastInput[] = accounts.map((account) => {
    const own = cardRows.filter((r) => r.account === account);
    const billingDay = billingDayOf(own.map((r) => r.billingDate), fallbackBillingDay);
    const posted: Record<string, number> = {};
    for (const r of own) {
      // Charges are negative and refunds positive, so this nets refunds out of the bill.
      if (r.billingDate >= today) posted[r.billingDate] = (posted[r.billingDate] ?? 0) - r.amount;
    }
    const pendingTotal = pending.get(account) ?? 0;
    if (pendingTotal !== 0) {
      // A charge still pending on billing day misses today's statement.
      const [next] = upcomingBillingDates(addDays(today, 1), billingDay, 1);
      posted[next] = (posted[next] ?? 0) + pendingTotal;
    }
    // shortcut: discretionary = prior 3-month mean spend minus recurring and next month's installments; refine once forecasts are compared with real bills.
    const priorMean = own.filter((r) => prior.includes(r.date.slice(0, 7))).reduce((s, r) => s + spent(r), 0) / 3;
    const recurring = series
      .filter((s) => s.account === account && s.status === "suggested")
      .reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    const nextInstallments = installments
      .filter((p) => p.account === account && p.month === nextMonth)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      account,
      billingDay,
      posted,
      avgDiscretionary: Math.max(0, priorMean - recurring - nextInstallments),
    };
  });

  return { series, installments, cards, anomalies, monthTotal, topCategories };
}
