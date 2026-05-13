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
  if (!(error instanceof Error)) {
    return "An unknown error occurred during scraping";
  }
  let msg = error.message;
  // Strip 5+ digit numbers (likely ID numbers, card digits, etc.)
  msg = msg.replace(/\b\d{5,}\b/g, "[REDACTED]");
  // Strip password and id values from JSON-like blobs.
  // Match a key followed by quoted string OR unquoted value, non-greedy.
  msg = msg.replace(
    /"(password|id|card6Digits|cardSuffix)"\s*:\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  );
  msg = msg.replace(
    /\b(password|id|card6Digits|cardSuffix)\s*=\s*\S+/gi,
    "$1=[REDACTED]"
  );
  return msg;
}

/**
 * Detect transient errors we should retry, or surface with friendlier copy.
 */
function classifyError(error: unknown): {
  retryable: boolean;
  friendly: string | null;
} {
  if (!(error instanceof Error)) {
    return { retryable: false, friendly: null };
  }
  const msg = error.message;

  // Isracard ValidateIdData returns an empty body when the ID/card-suffix
  // combination doesn't match a real card. This is almost always a credential
  // typo (most commonly entering the full ID into the "Last 6 Digits" field).
  if (/reqName=ValidateIdData/.test(msg)) {
    return {
      retryable: false,
      friendly:
        "Isracard rejected your ID and card combination. Double-check the 'Last 6 Digits of Your Card' field - it should be the last 6 digits of your credit card number, NOT your Israeli ID. Re-run setup from the settings drawer to fix it.",
    };
  }

  // Empty JSON response from bank - usually transient (rate limit, bot block, flaky endpoint).
  if (
    /Unexpected end of JSON input/.test(msg) ||
    /fetchPostWithinPage parse error/.test(msg)
  ) {
    return {
      retryable: true,
      friendly:
        "The bank returned an empty response. This usually means temporary rate limiting or a flaky endpoint on their side. We'll retry automatically; if it keeps failing, wait a few minutes and try again.",
    };
  }

  if (/net::ERR_/i.test(msg) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return {
      retryable: true,
      friendly:
        "Network error reaching the bank. Check your connection and try again.",
    };
  }

  if (/Navigation timeout|TimeoutError/i.test(msg)) {
    return {
      retryable: true,
      friendly:
        "The bank's site took too long to respond. Often temporary - try again in a minute.",
    };
  }

  if (/Cloudflare|captcha|recaptcha/i.test(msg)) {
    return {
      retryable: false,
      friendly:
        "The bank's bot protection blocked the scrape. Try enabling 'Show browser during sync' so you can solve any challenges manually.",
    };
  }

  return { retryable: false, friendly: null };
}

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_PASSWORD:
    "The credentials were rejected by the bank. Double-check ID, card last 6 digits, and password.",
  CHANGE_PASSWORD:
    "The bank is asking you to change your password. Log in via the bank's website first.",
  ACCOUNT_BLOCKED:
    "The account is blocked by the bank. Resolve this on the bank's website.",
  TIMEOUT:
    "The scrape timed out. The bank's site may be slow or down. Try again.",
  TWO_FACTOR_RETRIEVER_MISSING:
    "This account has 2FA enabled. Disable 2FA on the bank's site (most scrapers don't support it).",
  GENERIC:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
  GENERAL_ERROR:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
};

async function runScrape(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  showBrowser: boolean
): Promise<ScrapeResult> {
  const companyId = PROVIDER_MAP[provider];
  if (!companyId) {
    return {
      success: false,
      accounts: [],
      errorMessage: `Unsupported provider: ${provider}`,
    };
  }

  const scraper = createScraper({
    companyId,
    startDate,
    combineInstallments: false,
    showBrowser,
    // Verbose logs include URLs and posted payloads (incl. credentials).
    // Only enable when the user is also showing the browser (= they're debugging).
    verbose: showBrowser,
    timeout: 60000,
  });

  // credentials shape varies by provider; the library accepts different types per bank
  const result = await scraper.scrape(
    credentials as Parameters<typeof scraper.scrape>[0]
  );

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
}

export async function scrapeBank(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date
): Promise<ScrapeResult> {
  const { showBrowser } = getAppSettings();
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[scraper] starting scrape for ${provider} from ${startDate.toISOString()} (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
      return await runScrape(provider, credentials, startDate, showBrowser);
    } catch (error) {
      lastError = error;
      console.error(
        `[scraper] unexpected error on attempt ${attempt}:`,
        error
      );
      const { retryable } = classifyError(error);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const backoffMs = 2000 * attempt;
      console.log(`[scraper] retryable error, waiting ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  const { friendly } = classifyError(lastError);
  const detail = sanitizeError(lastError);
  return {
    success: false,
    accounts: [],
    errorMessage: friendly ? `${friendly} (${detail})` : detail,
  };
}
