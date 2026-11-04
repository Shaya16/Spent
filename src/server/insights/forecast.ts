import "server-only";

import { addDays, addMonths, daysBetween, monthDate } from "../lib/date-utils";
import type { ProjectedPayment } from "./installments";
import { isActive, type Series } from "./recurring";

export interface BillForecast {
  /** Card billing date, YYYY-MM-DD. */
  date: string;
  /** Card account, set by forecastCards. */
  account?: string;
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
  /** Charges already made that will land on an upcoming bill, by billing date (net of refunds). When given, the first bill's remaining spend is scaled to the days left. */
  posted?: Record<string, number>;
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

/** The next `count` billing dates on or after `today` for a card billed on `billingDay`. */
export function upcomingBillingDates(today: string, billingDay: number, count: number): string[] {
  const [ty, tm] = today.split("-").map(Number);
  const dates: string[] = [];
  for (let idx = ty * 12 + (tm - 1); dates.length < count; idx++) {
    const d = monthDate(Math.floor(idx / 12), (idx % 12) + 1, billingDay);
    if (d >= today) dates.push(d);
  }
  return dates;
}

/** The next 3 card bills: confirmed recurring charges, remaining installments and typical other spend. */
export function forecastBill(opts: ForecastOptions): BillForecast[] {
  const dates = upcomingBillingDates(opts.today, opts.billingDay, 3);

  const active = opts.series.filter((s) => s.status === "suggested" && isActive(s, opts.today));
  // Issuers shift the processed date off the nominal billing day (weekends, holidays),
  // so each posted charge goes to the nearest billing date, within half a month.
  const postedByBill = dates.map(() => 0);
  for (const [day, amount] of Object.entries(opts.posted ?? {})) {
    let best = 0;
    for (let k = 1; k < dates.length; k++) {
      if (Math.abs(daysBetween(day, dates[k])) < Math.abs(daysBetween(day, dates[best]))) best = k;
    }
    if (Math.abs(daysBetween(day, dates[best])) <= 15) postedByBill[best] += amount;
  }

  return dates.map((date, i) => {
    const prev = i === 0 ? opts.today : dates[i - 1];
    const recurring = active.reduce((sum, s) => sum + occurrences(s, prev, date) * s.expectedAmount, 0);
    const installments = opts.installments
      .filter((p) => p.date > prev && p.date <= date)
      .reduce((sum, p) => sum + p.amount, 0);
    const posted = postedByBill[i];
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

export interface CardForecastInput {
  account: string;
  billingDay: number;
  /** Charges already made on this card, by the billing date they land on. */
  posted: Record<string, number>;
  avgDiscretionary: number;
}

/** Next 3 bills of every card, each on its own billing day, with only that card's subscriptions and installments. */
export function forecastCards(opts: {
  today: string;
  cards: CardForecastInput[];
  series: Series[];
  installments: ProjectedPayment[];
}): BillForecast[] {
  return opts.cards
    .flatMap((card) =>
      forecastBill({
        billingDay: card.billingDay,
        today: opts.today,
        series: opts.series.filter((s) => s.account === card.account),
        installments: opts.installments.filter((p) => p.account === card.account),
        avgDiscretionary: card.avgDiscretionary,
        posted: card.posted,
      }).map((f) => ({ ...f, account: card.account }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
