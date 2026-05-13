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
- Use ONLY category names from the provided list
- Every transaction must be categorized
- If unsure, use "Other"
- Israeli merchant names are common; categorize based on the business type`;
  }

  // Proposal mode: allow the AI to suggest new categories.
  return `Categorize these financial transactions. Prefer the existing categories below. Only propose a new category when no existing one fits well.

Existing categories:
${categoriesList}

Transactions:
${transactionLines}

Return ONLY a valid JSON array. Each element MUST have "index" (number) and "categoryName" (string). If you propose a new category, add "isNew": true.

Existing category example: {"index": 0, "categoryName": "Groceries"}
New category example:      {"index": 3, "categoryName": "Pet supplies", "isNew": true}

Rules for new categories:
- Propose only when truly necessary - prefer existing.
- Use general English names, not merchant names. Good: "Pet supplies", "Childcare". Bad: "Petco", "My favorite cafe".
- If several transactions need the same new category, reuse the same name with isNew: true on each.
- Names must be Title Case, 1-3 words, ASCII letters and spaces only.

Rules for every transaction:
- Every transaction must be categorized.
- Israeli merchant names are common; categorize based on the business type.
- If unsure and no obvious new category fits, use "Other".`;
}

export const SYSTEM_PROMPT =
  "You are a financial transaction categorizer. You receive transaction descriptions and return JSON categorizations. Be precise and consistent. Respond with ONLY the JSON array, no other text.";
