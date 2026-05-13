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
      timeout: 60000,
    });

    // credentials shape varies by provider; the library accepts different types per bank
    const result = await scraper.scrape(credentials as Parameters<typeof scraper.scrape>[0]);

    if (!result.success) {
      return {
        success: false,
        accounts: [],
        errorMessage: result.errorMessage
          ? sanitizeError(new Error(result.errorMessage))
          : `Scraping failed: ${result.errorType ?? "unknown error"}`,
      };
    }

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
    return {
      success: false,
      accounts: [],
      errorMessage: sanitizeError(error),
    };
  }
}
