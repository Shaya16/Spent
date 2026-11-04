import "server-only";

const FORK_PROVIDERS = new Set(["isracard", "max"]);

/**
 * Isracard and Max can use @sergienko4/israeli-bank-scrapers (browserless, reports window coverage).
 * Opt-in: rows from the two libraries are not guaranteed to hash the same, so switching an existing
 * install could store duplicates of transactions already saved.
 */
export function usesScraperFork(
  provider: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SPENT_SCRAPER_FORK === "1" && FORK_PROVIDERS.has(provider);
}
