import { NextResponse } from "next/server";
import {
  batchUpdateCategories,
} from "@/server/db/queries/transactions";
import {
  ensureCategory,
  getCategoryByName,
  getParentIds,
} from "@/server/db/queries/categories";
import type { CategoryKind } from "@/lib/types";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

interface ApplyBody {
  /**
   * Original assignments returned by /preview. These reference transactions by id and
   * categories by name. Mark each as isNew to indicate the AI proposed it.
   */
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKind;
  }>;
  /**
   * The set of new-category names the user approved during review. Anything in
   * assignments with isNew but not in this set is dropped (the transaction
   * stays uncategorized).
   */
  approvedNewCategoryNames: string[];
  /**
   * Optional per-name mapping when the user chose to redirect a proposed new
   * category onto an existing one (e.g., "Pet supplies" → "Subscriptions").
   */
  rejectionFallbacks?: Record<string, string>;
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
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
  // Parents must never receive transactions. If the AI somehow returns a
  // parent name (despite the prompt guidance), skip rather than assign.
  const parentIds = getParentIds(workspaceId);

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
          const wasExisting = getCategoryByName(workspaceId, a.categoryName);
          const cat = ensureCategory(
            workspaceId,
            a.categoryName,
            undefined,
            a.kind ?? "expense"
          );
          if (!wasExisting) createdCount++;
          newCategoryCache.set(a.categoryName.toLowerCase(), cat.id);
          updates.push({ id: a.transactionId, categoryId: cat.id });
        }
      } else {
        // Rejected. Try a fallback if user set one.
        const fallbackName = fallbacks[a.categoryName];
        if (fallbackName) {
          const fallbackCat = getCategoryByName(workspaceId, fallbackName);
          if (fallbackCat && !parentIds.has(fallbackCat.id)) {
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
      const cat = getCategoryByName(workspaceId, a.categoryName);
      if (cat && !parentIds.has(cat.id)) {
        updates.push({ id: a.transactionId, categoryId: cat.id });
      } else {
        skippedCount++;
      }
    }
  }

  batchUpdateCategories(workspaceId, updates);

  return NextResponse.json({
    appliedCount: updates.length,
    createdCategoriesCount: createdCount,
    skippedCount,
  });
}
