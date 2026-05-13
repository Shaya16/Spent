// Standalone smoke test for the transfer-detection regexes.
// Keep the pattern list in sync with src/server/lib/transfers.ts.
// Run with: npx tsx scripts/test-detect-transfer.ts

const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
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

const BANK_PROVIDERS = new Set(["hapoalim", "leumi"]);

function detectTransfer(description: string, provider: string): boolean {
  if (!BANK_PROVIDERS.has(provider)) return false;
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CREDIT_CARD_PAYMENT_PATTERNS.some((p) => p.test(normalized));
}

const tests: Array<[string, string, boolean]> = [
  ["תשלום ויזה כאל 4,328", "hapoalim", true],
  ["ויזה קפה תל אביב 45", "hapoalim", true],
  ["סופר פארם 89", "hapoalim", false],
  ["ISRACARD payment", "hapoalim", true],
  ["MAX bill", "hapoalim", true],
  ["random merchant", "hapoalim", false],
  ["תשלום ויזה כאל 4,328", "isracard", false],
  ["תשלום ויזה כאל 4,328", "cal", false],
  ["", "hapoalim", false],
  ["AMEX international", "leumi", true],
  ["MASTERCARD payment", "hapoalim", true],
  ["דיינרס club", "hapoalim", true],
  ["ישראכרט חיוב", "hapoalim", true],
  ["חיוב כרטיס אשראי", "hapoalim", true],
  ["רמי לוי שיווק", "hapoalim", false],
  ["TLV cafe", "hapoalim", false],
];

let fail = 0;
for (const [desc, provider, expected] of tests) {
  const got = detectTransfer(desc, provider);
  const status = got === expected ? "OK  " : "FAIL";
  if (got !== expected) fail++;
  console.log(`${status} ${JSON.stringify(desc)} / ${provider} -> ${got} (expected ${expected})`);
}
console.log(`\nFailed: ${fail}/${tests.length}`);
process.exit(fail > 0 ? 1 : 0);
