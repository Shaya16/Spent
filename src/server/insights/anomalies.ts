import "server-only";

import { addDays, monthKey } from "../lib/date-utils";

export interface AnomalyTxn {
  merchant: string;
  category: string;
  /** Charges are negative. */
  amount: number;
  date: string;
}

export interface Anomaly {
  type: "category_spike" | "new_large_merchant" | "duplicate_charge";
  detail: string;
  merchant?: string;
  category?: string;
  amount?: number;
}

const SPIKE_RATIO = 1.5;
const SPIKE_MIN = 300;
const LARGE_CHARGE = 500;

export function findAnomalies(txns: AnomalyTxn[], today: string): Anomaly[] {
  const out: Anomaly[] = [];
  const spend = txns.filter((t) => t.amount < 0);

  // Category spending this month vs the mean of the 3 months before.
  const thisMonth = monthKey(today);
  const prior = [-1, -2, -3].map((s) => monthKey(today, s));
  const byCat = new Map<string, { now: number; before: number }>();
  for (const t of spend) {
    const m = t.date.slice(0, 7);
    const row = byCat.get(t.category) ?? { now: 0, before: 0 };
    if (m === thisMonth) row.now += -t.amount;
    else if (prior.includes(m)) row.before += -t.amount;
    byCat.set(t.category, row);
  }
  for (const [category, { now, before }] of byCat) {
    const mean = before / 3;
    if (mean > 0 && now >= SPIKE_MIN && now > SPIKE_RATIO * mean) {
      out.push({ type: "category_spike", category, amount: now, detail: `${category}: ${Math.round(now)} this month vs ${Math.round(mean)} usual` });
    }
  }

  const recentFrom = addDays(today, -7);
  const recent = spend.filter((t) => t.date > recentFrom);

  const seenBefore = new Set(spend.filter((t) => t.date <= recentFrom).map((t) => t.merchant));
  for (const t of recent) {
    if (-t.amount >= LARGE_CHARGE && !seenBefore.has(t.merchant)) {
      out.push({ type: "new_large_merchant", merchant: t.merchant, amount: -t.amount, detail: `New merchant ${t.merchant}: ${Math.round(-t.amount)}` });
      seenBefore.add(t.merchant);
    }
  }

  const counts = new Map<string, number>();
  for (const t of recent) {
    const key = `${t.merchant}|${t.amount}|${t.date}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) {
    if (n < 2) continue;
    const [merchant, amount] = key.split("|");
    out.push({ type: "duplicate_charge", merchant, amount: -Number(amount), detail: `${merchant} charged ${n}x ${-Number(amount)} on the same day` });
  }
  return out;
}
