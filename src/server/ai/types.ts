import "server-only";

export type AIConfidence = "high" | "medium" | "low";

export interface CategoryMapping {
  index: number;
  categoryName: string;
  /** True when the AI proposed this as a brand-new category (not in the input list). */
  isNew?: boolean;
  /** How confident the AI is in this categorization. Missing or invalid → treat as "high". */
  confidence?: AIConfidence;
}

export interface TransactionForCategorization {
  description: string;
  amount: number;
  currency: string;
  memo?: string | null;
}

export interface AIProvider {
  categorize(
    transactions: TransactionForCategorization[],
    categoryNames: string[],
    options?: { allowProposals?: boolean }
  ): Promise<CategoryMapping[]>;
}
