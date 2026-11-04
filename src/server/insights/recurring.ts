import "server-only";

import { dayNumber } from "../lib/date-utils";

export interface RecurringTxn {
  /** Normalized merchant key. */
  merchant: string;
  /** Card account the charge was made on. */
  account: string;
  currency: string;
  /** Charges are negative; refunds and income (>= 0) are ignored. */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
}

export type Cadence = "weekly" | "monthly" | "yearly";

export interface Series {
  merchant: string;
  account: string;
  currency: string;
  cadence: Cadence;
  /** Latest charge, or the mean when the price never changed. */
  expectedAmount: number;
  occurrences: number;
  /** Date of the most recent charge, YYYY-MM-DD. */
  lastDate: string;
  status: "candidate" | "suggested";
  priceChange?: { from: number; to: number; date: string };
}

const CADENCES: { name: Cadence; min: number; max: number }[] = [
  { name: "weekly", min: 6, max: 8 },
  { name: "monthly", min: 26, max: 35 },
  { name: "yearly", min: 350, max: 380 },
];
// Amounts within this fraction of the previous charge are the same price.
const SAME_PRICE = 0.075;
// Bigger jumps than this are a different purchase, not a price change.
const MAX_PRICE_JUMP = 0.5;

/** A series that has not charged within 1.5 cycles is treated as cancelled. */
export function isActive(s: Series, today: string): boolean {
  const cadence = CADENCES.find((c) => c.name === s.cadence)!;
  return dayNumber(today) - dayNumber(s.lastDate) <= cadence.max * 1.5;
}

// shortcut: gap windows stand in for the +/-2 day-of-month rule, and one price change per series; refine if real data shows false positives.
export function detectRecurring(txns: RecurringTxn[]): Series[] {
  const groups = new Map<string, RecurringTxn[]>();
  for (const t of txns) {
    if (!(t.amount < 0)) continue;
    const key = `${t.account}|${t.merchant}|${t.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: Series[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;
    if (n < 2) continue;

    const lastGap = dayNumber(sorted[n - 1].date) - dayNumber(sorted[n - 2].date);
    const cadence = CADENCES.find((c) => lastGap >= c.min && lastGap <= c.max);
    if (!cadence) continue;

    const chain = [sorted[n - 1]];
    let jumps = 0;
    let change: Series["priceChange"];
    for (let i = n - 2; i >= 0; i--) {
      const head = chain[0];
      const gap = dayNumber(head.date) - dayNumber(sorted[i].date);
      if (gap < cadence.min || gap > cadence.max) break;
      const prev = Math.abs(sorted[i].amount);
      const cur = Math.abs(head.amount);
      const jump = Math.abs(cur - prev) / prev;
      if (jump > MAX_PRICE_JUMP) break;
      if (jump > SAME_PRICE) {
        // A second, older price change ends the run: the series is what has been stable since.
        if (jumps >= 1) break;
        jumps++;
        change = { from: prev, to: cur, date: head.date };
      }
      chain.unshift(sorted[i]);
    }
    if (chain.length < 2) continue;

    const amounts = chain.map((c) => Math.abs(c.amount));
    out.push({
      merchant: sorted[0].merchant,
      account: sorted[0].account,
      currency: sorted[0].currency,
      cadence: cadence.name,
      expectedAmount: change ? amounts[amounts.length - 1] : amounts.reduce((a, b) => a + b, 0) / amounts.length,
      occurrences: chain.length,
      lastDate: chain[chain.length - 1].date,
      status: chain.length >= 3 ? "suggested" : "candidate",
      ...(change ? { priceChange: change } : {}),
    });
  }
  return out;
}
