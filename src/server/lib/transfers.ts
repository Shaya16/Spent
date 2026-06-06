import "server-only";

import type { BankProvider } from "@/lib/types";

export type TransactionKind = "expense" | "income" | "transfer";

const BANK_PROVIDERS_SET: ReadonlySet<BankProvider> = new Set<BankProvider>([
  "hapoalim",
  "leumi",
  "mizrahi",
  "discount",
  "mercantile",
  "beinleumi",
  "otsarHahayal",
  "pagi",
  "yahav",
  "massad",
  "union",
  "oneZero",
]);

export const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /ישראכרט/i,
  /ישרא[\s־-]?כארד/i,
  // Match כאל / כ.א.ל / כ א ל / כ-א-ל (Israeli abbreviation for Cal credit).
  /כ[\s.\-־]?א[\s.\-־]?ל/i,
  /מקסימום/i,
  /מאסטרקארד/i,
  /אמריקן\s*אקספרס/i,
  /אמקס/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  // `כרטיסי?` matches both the singular `כרטיס אשראי` and the plural
  // `כרטיסי אשראי` form bank statements use (e.g. "כרטיסי אשראי ל").
  /כרטיסי?\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /לאומי\s*קארד/i,
  /חיוב\s*לכרטיס/i,
  /\bISRACARD\b/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bCAL\b/i,
  /\bMAX\b/i,
  /\bDINERS\b/i,
  /\bAMEX\b/i,
  /\bAMERICAN\s+EXPRESS\b/i,
  /\bLEUMI\s+CARD\b/i,
];

// Internal transfers between the user's own accounts (Bank A -> Bank B) show up
// as an expense on one side and income on the other. We only treat a row as an
// internal transfer when it carries one of these hints AND a matching opposite
// row exists (see findInternalTransferPairs); the keyword alone is not enough.
const INTERNAL_TRANSFER_PATTERNS: readonly RegExp[] = [
  /העברה/i,
  /העברת/i,
  /\btransfer\b/i,
  /\bwire\b/i,
];

// ATM cash withdrawals. Used to deterministically file them under "Cash & ATM"
// (or as transfers when the user tracks cash manually).
const ATM_WITHDRAWAL_PATTERNS: readonly RegExp[] = [
  /משיכת\s*מזומן/i,
  /משיכה\s*מבנקט/i,
  /כספומט/i,
  /בנקט/i,
  /\bATM\b/i,
  /cash\s*withdrawal/i,
];

export function isBankProvider(provider: string): provider is BankProvider {
  return BANK_PROVIDERS_SET.has(provider as BankProvider);
}

function matchesAny(description: string, patterns: readonly RegExp[]): boolean {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return patterns.some((pattern) => pattern.test(normalized));
}

function matchesTransferPattern(description: string): boolean {
  return matchesAny(description, CREDIT_CARD_PAYMENT_PATTERNS);
}

/** True when a description looks like a bank-side credit card bill payment. */
export function matchesCreditCardPayment(description: string): boolean {
  return matchesAny(description, CREDIT_CARD_PAYMENT_PATTERNS);
}

export function matchesInternalTransfer(description: string): boolean {
  return matchesAny(description, INTERNAL_TRANSFER_PATTERNS);
}

export function isAtmWithdrawal(description: string): boolean {
  return matchesAny(description, ATM_WITHDRAWAL_PATTERNS);
}

export function detectKind(
  description: string,
  provider: string,
  chargedAmount: number,
): TransactionKind {
  if (isBankProvider(provider) && matchesTransferPattern(description)) {
    return "transfer";
  }
  if (isBankProvider(provider) && chargedAmount > 0) {
    return "income";
  }
  return "expense";
}
