import "server-only";

export interface ScrapedTransaction {
  type: "normal" | "installments";
  identifier?: string | number;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  installments?: { number: number; total: number };
  status: "completed" | "pending";
}

export interface ScrapedAccount {
  accountNumber: string;
  transactions: ScrapedTransaction[];
}

export interface ScrapeResult {
  success: boolean;
  accounts: ScrapedAccount[];
  errorMessage?: string;
}
