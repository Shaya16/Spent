import type { ScrapeResult, ScrapedTransaction } from "./types";

interface RawTxn {
  type?: string;
  identifier?: string | number | null;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string | null;
  description: string;
  memo?: string | null;
  installments?: { number: number; total: number } | null;
  status?: string;
}

interface RawAccount {
  accountNumber: string;
  txns: RawTxn[];
  windowCoverage?: { status: string; reason?: string; caveats?: readonly string[] };
}

export interface RawScrapeResult {
  success: boolean;
  accounts?: RawAccount[];
}

// Caveats where the fork says rows may have been lost; the *AuditUnavailable ones only mean a check could not run.
const LOSS_CAVEATS = new Set([
  "paginationStoppedEarly",
  "declaredRowShortfall",
  "extractionShortfall",
  "mappingRejectedRows",
  "walkOrderViolated",
]);

const israelDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** The fork reports UTC instants; Israeli midnight is 21:00/22:00Z the day before. Unparseable values pass through. */
function toIsraelDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${israelDay.format(d)}T00:00:00.000Z`;
}

/** A window problem worth failing the sync for, or null. A quiet or brand-new card with no rows is fine. */
function windowProblem(account: RawAccount): string | null {
  const w = account.windowCoverage;
  if (!w) return null;
  if (w.status === "unproven") return account.txns.length > 0 ? "the requested date range was not reached" : null;
  if (w.status === "lowerBoundReached" && w.caveats?.some((c) => LOSS_CAVEATS.has(c))) return "some rows may be missing";
  return null;
}

/** Maps a scraper result to ours; fails the whole result if any account's data may be incomplete. */
export function toScrapeResult(result: RawScrapeResult): ScrapeResult {
  const accounts = result.accounts ?? [];

  for (const account of accounts) {
    const problem = windowProblem(account);
    if (problem) {
      return {
        success: false,
        accounts: [],
        errorMessage: `Could not confirm complete data for account ${account.accountNumber} (${problem}); nothing was saved. Try again later.`,
      };
    }
  }

  return {
    success: true,
    accounts: accounts.map((account) => ({
      accountNumber: account.accountNumber,
      transactions: account.txns.map(
        (txn): ScrapedTransaction => ({
          type: txn.type === "installments" ? "installments" : "normal",
          identifier: txn.identifier ?? undefined,
          date: toIsraelDate(txn.date),
          processedDate: toIsraelDate(txn.processedDate),
          originalAmount: txn.originalAmount,
          originalCurrency: txn.originalCurrency,
          chargedAmount: txn.chargedAmount,
          chargedCurrency: txn.chargedCurrency ?? undefined,
          description: txn.description,
          memo: txn.memo ?? undefined,
          installments: txn.installments
            ? { number: txn.installments.number, total: txn.installments.total }
            : undefined,
          status: txn.status === "completed" ? "completed" : "pending",
        })
      ),
    })),
  };
}
