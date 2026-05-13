import "server-only";

import type { BankProvider } from "@/lib/types";

export type TransactionKind = "expense" | "income" | "transfer";

const BANK_PROVIDERS_SET: ReadonlySet<BankProvider> = new Set<BankProvider>([
  "hapoalim",
  "leumi",
]);

export const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /ישראכרט/i,
  /ישרא[\s־-]?כארד/i,
  /כאל/i,
  /מקסימום/i,
  /מאסטרקארד/i,
  /אמריקן\s*אקספרס/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  /כרטיס\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /\bISRACARD\b/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bCAL\b/i,
  /\bMAX\b/i,
  /\bDINERS\b/i,
  /\bAMEX\b/i,
  /\bAMERICAN\s+EXPRESS\b/i,
];

export function isBankProvider(provider: string): provider is BankProvider {
  return BANK_PROVIDERS_SET.has(provider as BankProvider);
}

function matchesTransferPattern(description: string): boolean {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CREDIT_CARD_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function detectKind(
  description: string,
  provider: string,
  chargedAmount: number
): TransactionKind {
  if (isBankProvider(provider) && matchesTransferPattern(description)) {
    return "transfer";
  }
  if (isBankProvider(provider) && chargedAmount > 0) {
    return "income";
  }
  return "expense";
}
