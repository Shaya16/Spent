import "server-only";

export type BudgetStatus = "plenty-left" | "on-track" | "heads-up" | "over";

/**
 * Number of days in a calendar month.
 */
export function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

/**
 * Day number (1-based) within the given month "today" maps to.
 * Clamps to [1, daysInMonth] if today is outside that month.
 */
export function dayWithinMonth(
  today: Date,
  year: number,
  monthZeroBased: number
): number {
  const total = daysInMonth(year, monthZeroBased);
  if (today.getFullYear() !== year || today.getMonth() !== monthZeroBased) {
    if (
      today.getFullYear() < year ||
      (today.getFullYear() === year && today.getMonth() < monthZeroBased)
    ) {
      return 0;
    }
    return total;
  }
  return Math.min(today.getDate(), total);
}

/**
 * Compute the next payday given a configured day-of-month.
 * Returns the next occurrence on or after today.
 */
export function nextPayday(today: Date, paydayDay: number): Date {
  const day = Math.max(1, Math.min(28, paydayDay));
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) {
    return new Date(today.getFullYear(), today.getMonth() + 1, day);
  }
  return candidate;
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Derive a budget status from spent, budget, and how much of the period elapsed.
 *
 * - "over": spent > budget
 * - "heads-up": spent / budget exceeds time elapsed by 20+ points
 * - "plenty-left": spent / budget is at least 30 points below time elapsed
 * - "on-track": everything else
 */
export function computeStatus(
  spent: number,
  budget: number,
  timeElapsedPercent: number
): BudgetStatus {
  if (budget <= 0) return "on-track";
  const pctSpent = (spent / budget) * 100;
  if (pctSpent > 100) return "over";
  const delta = pctSpent - timeElapsedPercent;
  if (delta >= 20) return "heads-up";
  if (delta <= -30) return "plenty-left";
  return "on-track";
}

/**
 * Conversational sentence for the hero card.
 *
 * `displaySpent` is the amount shown to the user (total period spend).
 * `budgetedSpent` is the amount used for pace calculation (spend in
 * categories that have a budget). They differ when some categories are in
 * tracking-only mode.
 */
export function pacePhrase(
  displaySpent: number,
  budgetedSpent: number,
  totalBudget: number,
  timeElapsedPercent: number,
  monthLabel: string
): string {
  if (totalBudget <= 0) {
    return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — set budgets to see how you're pacing.`;
  }
  const pctSpent = (budgetedSpent / totalBudget) * 100;
  const delta = pctSpent - timeElapsedPercent;

  if (pctSpent > 100) {
    return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — over your monthly target, time to slow down.`;
  }
  if (delta >= 25) {
    return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — a touch over pace, but easy to recover.`;
  }
  if (delta <= -25) {
    return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — comfortably under pace.`;
  }
  if (delta <= -10) {
    return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — well within pace for the month.`;
  }
  return `You've spent ${formatILS(displaySpent)} this ${monthLabel} — on track for your monthly target.`;
}

function formatILS(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("en-IL")}`;
}
