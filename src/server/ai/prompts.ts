import "server-only";

import type { TransactionForCategorization } from "./types";

export function buildCategorizationPrompt(
  transactions: TransactionForCategorization[],
  categoryNames: string[],
  allowProposals = false
): string {
  const categoriesList = categoryNames.join(", ");

  const transactionLines = transactions
    .map(
      (t, i) =>
        `${i}: "${t.description}" | ${t.currency} ${Math.abs(t.amount).toFixed(2)}${t.memo ? ` | memo: "${t.memo}"` : ""}`
    )
    .join("\n");

  if (!allowProposals) {
    return `Categorize these financial transactions into one of these categories:
${categoriesList}

Transactions:
${transactionLines}

Return ONLY a valid JSON array where each element has "index" (number) and "categoryName" (string from the list above).
Example: [{"index": 0, "categoryName": "Groceries"}, {"index": 1, "categoryName": "Transport"}]

Rules:
- Use ONLY category names from the provided list.
- Every transaction must be categorized; pick the closest matching category.
- Israeli merchant names are common; categorize based on the business type.`;
  }

  // Proposal mode: the AI is encouraged to suggest new categories whenever
  // a transaction doesn't have a clear fit in the existing list.
  return `Categorize these financial transactions. Use an existing category when one clearly fits. When no existing category is a good fit, propose a new one.

Existing categories:
${categoriesList}

Transactions:
${transactionLines}

Return ONLY a valid JSON array. Each element MUST have "index" (number) and "categoryName" (string). If you propose a new category, add "isNew": true.

Existing category example: {"index": 0, "categoryName": "Groceries"}
New category example:      {"index": 3, "categoryName": "Pet supplies", "isNew": true}

Rules for new categories:
- General English names that describe a TYPE of spending, not a specific merchant. Good: "Pet supplies", "Childcare", "Tools & Hardware", "Books & Media". Bad: "Petco", "My favorite cafe".
- Title Case, 1-3 words, ASCII letters and spaces only.
- If several transactions need the same new category, reuse the same name with isNew: true on each.
- Don't over-propose. If an existing category is a reasonable fit, prefer it.

Rules for every transaction:
- Every transaction must be categorized - either an existing or a proposed new category.
- Israeli merchant names are common; categorize based on the business type.`;
}

export const SYSTEM_PROMPT =
  "You are a financial transaction categorizer. You receive transaction descriptions and return JSON categorizations. Be precise and consistent. Respond with ONLY the JSON array, no other text.";
