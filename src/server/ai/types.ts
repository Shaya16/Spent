import "server-only";

export interface CategoryMapping {
  index: number;
  categoryName: string;
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
    categoryNames: string[]
  ): Promise<CategoryMapping[]>;
}
