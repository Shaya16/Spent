import "server-only";

import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import type { ScrapeResult, ScrapedTransaction } from "./types";
import type { BankProvider } from "@/lib/types";
import { getAppSettings } from "../db/queries/settings";

const PROVIDER_MAP: Record<string, CompanyTypes> = {
  isracard: CompanyTypes.isracard,
  cal: CompanyTypes.visaCal,
  max: CompanyTypes.max,
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
};

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message
      .replace(/\b\d{5,}\b/g, "[REDACTED]")
      .replace(/password['":\s]*[^\s,}]*/gi, "password: [REDACTED]")
      .replace(/id['":\s]*[^\s,}]*/gi, "id: [REDACTED]");
    return msg;
  }
  return "An unknown error occurred during scraping";
}

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "The credentials were rejected by the bank. Double-check ID, card last 6 digits, and password.",
  CHANGE_PASSWORD: "The bank is asking you to change your password. Log in via the bank's website first.",
  ACCOUNT_BLOCKED: "The account is blocked by the bank. Resolve this on the bank's website.",
  TIMEOUT: "The scrape timed out. The bank's site may be slow or down. Try again.",
  TWO_FACTOR_RETRIEVER_MISSING: "This account has 2FA enabled. Disable 2FA on the bank's site (most scrapers don't support it).",
  GENERIC: "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
  GENERAL_ERROR: "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
};

export async function scrapeBank(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date
): Promise<ScrapeResult> {
  const companyId = PROVIDER_MAP[provider];
  if (!companyId) {
    return { success: false, accounts: [], errorMessage: `Unsupported provider: ${provider}` };
  }

  try {
    const { showBrowser } = getAppSettings();

    const scraper = createScraper({
      companyId,
      startDate,
      combineInstallments: false,
      showBrowser,
      verbose: true,
      timeout: 60000,
    });

    console.log(`[scraper] starting scrape for ${provider} from ${startDate.toISOString()}`);

    // credentials shape varies by provider; the library accepts different types per bank
    const result = await scraper.scrape(credentials as Parameters<typeof scraper.scrape>[0]);

    if (!result.success) {
      const errorType = result.errorType ?? "GENERIC";
      console.error(`[scraper] failed (${errorType}):`, result.errorMessage);
      const friendly = FRIENDLY_ERRORS[errorType];
      const detail = result.errorMessage
        ? sanitizeError(new Error(result.errorMessage))
        : errorType;
      return {
        success: false,
        accounts: [],
        errorMessage: friendly
          ? `${friendly} (${detail})`
          : `Scraping failed: ${detail}`,
      };
    }

    const txnCount = (result.accounts ?? []).reduce(
      (sum, a) => sum + a.txns.length,
      0
    );
    console.log(
      `[scraper] success: ${result.accounts?.length ?? 0} account(s), ${txnCount} transaction(s)`
    );

    const accounts = (result.accounts ?? []).map((account) => ({
      accountNumber: account.accountNumber,
      transactions: account.txns.map(
        (txn): ScrapedTransaction => ({
          type: txn.type === "installments" ? "installments" : "normal",
          identifier: txn.identifier ?? undefined,
          date: txn.date,
          processedDate: txn.processedDate,
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
    }));

    return { success: true, accounts };
  } catch (error) {
    console.error("[scraper] unexpected error:", error);
    return {
      success: false,
      accounts: [],
      errorMessage: sanitizeError(error),
    };
  }
}
