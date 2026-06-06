import type { Category } from "@/lib/types";

/** Leaf ids for a category, or the category itself when it has no children. */
export function getCategoryDescendantIds(categoryId: number, allCategories: Category[]): number[] {
  const children = allCategories.filter((c) => c.parentId === categoryId);
  if (children.length === 0) return [categoryId];
  return children.flatMap((c) => getCategoryDescendantIds(c.id, allCategories));
}

export function isCategoryFilterChecked(
  categoryId: number,
  selectedIds: number[],
  allCategories: Category[],
): boolean {
  const descendants = getCategoryDescendantIds(categoryId, allCategories);
  return descendants.every((id) => selectedIds.includes(id));
}

/** Toggle a category and all descendants together (for parent groups). */
export function toggleCategoryFilterSelection(
  selectedIds: number[],
  categoryId: number,
  allCategories: Category[],
): number[] {
  const descendants = getCategoryDescendantIds(categoryId, allCategories);
  const allSelected = descendants.every((id) => selectedIds.includes(id));
  const next = new Set(selectedIds);
  if (allSelected) {
    for (const id of descendants) next.delete(id);
  } else {
    for (const id of descendants) next.add(id);
  }
  return [...next];
}

/** Expands each selected id to descendant leaf ids for the transactions query. */
export function expandCategoryFilterIds(
  selectedIds: number[],
  allCategories: Category[],
): number[] | undefined {
  if (selectedIds.length === 0) return undefined;
  const expanded = new Set<number>();
  for (const id of selectedIds) {
    for (const descId of getCategoryDescendantIds(id, allCategories)) {
      expanded.add(descId);
    }
  }
  return [...expanded];
}

export function formatMultiFilterDisplay(
  labels: string[],
  anyLabel: string,
  countLabel: (count: number) => string,
): string {
  if (labels.length === 0) return anyLabel;
  if (labels.length === 1) return labels[0]!;
  return countLabel(labels.length);
}
