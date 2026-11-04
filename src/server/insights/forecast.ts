import { addMonths, type ProjectedPayment } from "./installments";
import { isActive, type Series } from "./recurring";

export interface BillForecast {
  /** Card billing date, YYYY-MM-DD. */
  date: string;
  total: number;
  parts: { posted: number; recurring: number; installments: number; discretionary: number };
}

interface ForecastOptions {
  billingDay: number;
  today: string;
  series: Series[];
  installments: ProjectedPayment[];
  /** Typical non-recurring spend per billing cycle. */
  avgDiscretionary: number;
  /** Charges already made that will land on an upcoming bill, by billing date. When given, the first bill's remaining spend is scaled to the days left. */
  posted?: Record<string, number>;
}

function monthDate(year: number, month1: number, day: number): string {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return `${year}-${String(month1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Dates (strictly after `after`, up to `until`) on which a series is expected to charge. */
function occurrences(s: Series, after: string, until: string): number {
  let count = 0;
  for (let k = 1; k < 400; k++) {
    const date =
      s.cadence === "weekly" ? addDays(s.lastDate, 7 * k)
      : s.cadence === "monthly" ? addMonths(s.lastDate, k)
      : addMonths(s.lastDate, 12 * k);
    if (date > until) break;
    if (date > after) count++;
  }
  return count;
}

/** The next 3 card bills: confirmed recurring charges, remaining installments and typical other spend. */
export function forecastBill(opts: ForecastOptions): BillForecast[] {
  const [ty, tm] = opts.today.split("-").map(Number);
  const dates: string[] = [];
  let idx = ty * 12 + (tm - 1);
  while (dates.length < 3) {
    const d = monthDate(Math.floor(idx / 12), (idx % 12) + 1, opts.billingDay);
    if (d >= opts.today) dates.push(d);
    idx++;
  }

  const active = opts.series.filter((s) => s.status === "suggested" && isActive(s, opts.today));
  return dates.map((date, i) => {
    const prev = i === 0 ? opts.today : dates[i - 1];
    const recurring = active.reduce((sum, s) => sum + occurrences(s, prev, date) * s.expectedAmount, 0);
    const installments = opts.installments
      .filter((p) => p.date > prev && p.date <= date)
      .reduce((sum, p) => sum + p.amount, 0);
    const posted = opts.posted?.[date] ?? 0;
    let discretionary = opts.avgDiscretionary;
    if (i === 0 && opts.posted) {
      const cycleStart = addMonths(date, -1);
      const left = daysBetween(opts.today, date);
      const total = daysBetween(cycleStart, date);
      discretionary = total > 0 ? (opts.avgDiscretionary * Math.min(left, total)) / total : 0;
    }
    return {
      date,
      total: posted + recurring + installments + discretionary,
      parts: { posted, recurring, installments, discretionary },
    };
  });
}
