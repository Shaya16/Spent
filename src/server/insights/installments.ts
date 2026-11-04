import "server-only";

import { addMonths } from "../lib/date-utils";

export interface InstallmentTxn {
  merchant: string;
  account: string;
  /** Per-payment amount; sign is ignored. */
  amount: number;
  number: number;
  total: number;
  /** Billing date, YYYY-MM-DD. */
  date: string;
}

export interface ProjectedPayment {
  merchant: string;
  account: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month: string;
  amount: number;
}

/** Future payments of each installment plan, from its latest seen payment. Plans are keyed by account, merchant, amount and total. */
export function projectInstallments(txns: InstallmentTxn[], today: string): ProjectedPayment[] {
  const latest = new Map<string, InstallmentTxn>();
  for (const t of txns) {
    if (!(t.amount !== 0) || t.number < 1 || t.number > t.total) continue;
    const key = [t.account, t.merchant, Math.abs(t.amount), t.total].join("|");
    const prev = latest.get(key);
    if (!prev || t.number > prev.number) latest.set(key, t);
  }

  const out: ProjectedPayment[] = [];
  for (const t of latest.values()) {
    for (let k = 1; k <= t.total - t.number; k++) {
      const date = addMonths(t.date, k);
      if (date < today) continue;
      out.push({ merchant: t.merchant, account: t.account, date, month: date.slice(0, 7), amount: Math.abs(t.amount) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
