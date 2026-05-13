import "server-only";

/**
 * Format a Date as YYYY-MM-DD in *local* time.
 * Using `toISOString().slice(0, 10)` rolls the date back to UTC midnight,
 * which can shift it by a day in timezones east of UTC (e.g., Asia/Jerusalem).
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
