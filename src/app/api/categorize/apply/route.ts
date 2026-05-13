import { NextResponse } from "next/server";
import {
  batchUpdateCategories,
} from "@/server/db/queries/transactions";
import {
  ensureCategory,
  getCategoryByName,
} from "@/server/db/queries/categories";

interface ApplyBody {
  /**
   * Original assignments returned by /preview. These reference transactions by id and
   * categories by name. Mark each as isNew to indicate the AI proposed it.
   */
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
  }>;
  /**
   * The set of new-category names the user approved during review. Anything in
   * assignments with isNew but not in this set is dropped (the transaction
   * stays uncategorized).
   */
  approvedNewCategoryNames: string[];
  /**
   * Optional per-name mapping when the user chose to redirect a proposed new
   * category onto an existing one ("Pet supplies" → "Other" for example).
   */
  rejectionFallbacks?: Record<string, string>;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ApplyBody;
  const approved = new Set(
    (body.approvedNewCategoryNames ?? []).map((n) => n.toLowerCase())
  );
  const fallbacks = body.rejectionFallbacks ?? {};

  // Resolve every assignment to a concrete category id.
  // - existing categories: look up by name
  // - approved new categories: ensureCategory creates them
  // - rejected new categories with a fallback: use the fallback's id
  // - rejected new categories without a fallback: skip (transaction stays uncategorized)
  const newCategoryCache = new Map<string, number>();
  const updates: { id: number; categoryId: number }[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const a of body.assignments) {
    if (a.isNew) {
      const isApproved = approved.has(a.categoryName.toLowerCase());
      if (isApproved) {
        const cached = newCategoryCache.get(a.categoryName.toLowerCase());
        if (cached != null) {
          updates.push({ id: a.transactionId, categoryId: cached });
        } else {
          // Check if it already exists before creating
          const wasExisting = getCategoryByName(a.categoryName);
          const cat = ensureCategory(a.categoryName);
          if (!wasExisting) createdCount++;
          newCategoryCache.set(a.categoryName.toLowerCase(), cat.id);
          updates.push({ id: a.transactionId, categoryId: cat.id });
        }
      } else {
        // Rejected. Try a fallback if user set one.
        const fallbackName = fallbacks[a.categoryName];
        if (fallbackName) {
          const fallbackCat = getCategoryByName(fallbackName);
          if (fallbackCat) {
            updates.push({
              id: a.transactionId,
              categoryId: fallbackCat.id,
            });
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }
    } else {
      // Existing category
      const cat = getCategoryByName(a.categoryName);
      if (cat) {
        updates.push({ id: a.transactionId, categoryId: cat.id });
      } else {
        skippedCount++;
      }
    }
  }

  batchUpdateCategories(updates);

  return NextResponse.json({
    appliedCount: updates.length,
    createdCategoriesCount: createdCount,
    skippedCount,
  });
}
