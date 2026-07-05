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

/**
 * Scraped transaction dates are stored as UTC instants representing midnight
 * Asia/Jerusalem (21:00Z in summer, 22:00Z in winter). Shifting by +3 hours
 * before truncating lands on the correct Israeli calendar day in both DST
 * regimes, without depending on the server's OS timezone. If the storage
 * convention ever changes, this is the one place to update.
 */
export const TX_DATE_SHIFT = "+3 hours";

/**
 * SQL expression yielding a transaction's Israeli calendar day (YYYY-MM-DD).
 * Use this instead of comparing the raw `date` column against day strings.
 */
export function txLocalDay(column = "date"): string {
  return `date(${column}, '${TX_DATE_SHIFT}')`;
}
