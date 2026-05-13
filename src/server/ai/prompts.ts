import "server-only";

import type { TransactionForCategorization } from "./types";

export function buildCategorizationPrompt(
  transactions: TransactionForCategorization[],
  categoryNames: string[]
): string {
  const categoriesList = categoryNames.join(", ");

  const transactionLines = transactions
    .map(
      (t, i) =>
        `${i}: "${t.description}" | ${t.currency} ${Math.abs(t.amount).toFixed(2)}${t.memo ? ` | memo: "${t.memo}"` : ""}`
    )
    .join("\n");

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

export const SYSTEM_PROMPT =
  "You are a financial transaction categorizer. You receive transaction descriptions and return JSON categorizations. Be precise and consistent. Respond with ONLY the JSON array, no other text.";
