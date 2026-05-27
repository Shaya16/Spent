export type TransactionSortField =
  | "date"
  | "charged_amount"
  | "description"
  | "category_name"
  | "account";

export type SortOrder = "asc" | "desc";

export const TRANSACTION_SORT_FIELDS: TransactionSortField[] = [
  "date",
  "description",
  "category_name",
  "account",
  "charged_amount",
];

export function defaultSortOrder(field: TransactionSortField): SortOrder {
  if (field === "description" || field === "category_name" || field === "account") {
    return "asc";
  }
  return "desc";
}

export function nextSortState(
  currentField: TransactionSortField,
  currentOrder: SortOrder,
  clickedField: TransactionSortField,
): { field: TransactionSortField; order: SortOrder } {
  if (clickedField === currentField) {
    return {
      field: currentField,
      order: currentOrder === "asc" ? "desc" : "asc",
    };
  }
  return { field: clickedField, order: defaultSortOrder(clickedField) };
}

/** SQL ORDER BY expressions (must stay in sync with transaction list JOIN). */
export const TRANSACTION_SORT_SQL: Record<TransactionSortField, string> = {
  date: "t.date",
  charged_amount: "t.charged_amount",
  description: "t.description",
  category_name: "c.name",
  account: "COALESCE(bc.label, t.provider)",
};

export function isTransactionSortField(
  value: string | null | undefined,
): value is TransactionSortField {
  return value != null && (TRANSACTION_SORT_FIELDS as string[]).includes(value);
}
