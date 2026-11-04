// Nikud and cantillation marks (U+0591-U+05C7).
const NIKUD = /[֑-ׇ]/g;
// Trailing branch numbers and separator noise left by card issuers: "סניף 123*", "- 4421", "wolt*".
const TRAILING_NOISE = /(?:\s*(?:סניף|branch))?[\s\d*\-_.#]+$/i;

export function normalizeMerchant(description: string): string {
  return description
    .normalize("NFC")
    .replace(NIKUD, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_NOISE, "")
    .trim();
}

export function translateMerchant(key: string, table: Record<string, string>): string | null {
  return table[key] ?? null;
}
