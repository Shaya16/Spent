import "server-only";

const MAQAF = /\u05BE/g;
// Nikud and cantillation marks, U+0591-U+05C7 except the maqaf (U+05BE), which is a hyphen.
const NIKUD = /[\u0591-\u05BD\u05BF-\u05C7]/g;
// Invisible direction marks that issuers sometimes embed around Hebrew names.
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// Trailing noise card issuers append, removed until none is left:
const TRAILING = [
  /[\s*\-_.#]+$/, // separators: "wolt*", "name -"
  /\s*(?:סניף|branch)\s*\d*$/i, // explicit branch: "סניף 123"
  /\s+[*\-_#]\s*\d+$/, // separated number: "AMZN Mktp - 4421" (but not "7-11")
  // Bare branch number: "שופרסל 123". Kept from the original rule so existing learned keys still match,
  // which means "Office 365" also becomes "office".
  /\s+\d+$/,
];

export function normalizeMerchant(description: string): string {
  let s = description
    .normalize("NFC")
    .replace(BIDI_MARKS, "")
    .replace(MAQAF, "-")
    .replace(NIKUD, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (let previous = ""; previous !== s; ) {
    previous = s;
    for (const pattern of TRAILING) s = s.replace(pattern, "");
    s = s.trim();
  }
  return s;
}

export function translateMerchant(key: string, table: Record<string, string>): string | null {
  return table[key] ?? null;
}
