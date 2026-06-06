import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import type { CategoryKind } from "@/lib/types";
import { getOrm } from "../db/orm";
import { merchantCategories } from "../db/schema";

export function normalizeMerchant(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}

export interface MerchantMapping {
  merchantKey: string;
  categoryId: number;
  kind: CategoryKind;
  source: "user" | "approved-ai";
}

export function lookupMerchantCategory(
  workspaceId: number,
  description: string,
): MerchantMapping | null {
  const key = normalizeMerchant(description);
  if (!key) return null;
  const row = getOrm()
    .select({
      merchantKey: merchantCategories.merchantKey,
      categoryId: merchantCategories.categoryId,
      kind: merchantCategories.kind,
      source: merchantCategories.source,
    })
    .from(merchantCategories)
    .where(
      and(eq(merchantCategories.workspaceId, workspaceId), eq(merchantCategories.merchantKey, key)),
    )
    .get();
  return row ?? null;
}

export function lookupMerchantCategoriesBulk(
  workspaceId: number,
  descriptions: string[],
): Map<string, MerchantMapping> {
  if (descriptions.length === 0) return new Map();
  const keys = new Set<string>();
  const byKey = new Map<string, string>();
  for (const d of descriptions) {
    const k = normalizeMerchant(d);
    if (k) {
      keys.add(k);
      byKey.set(d, k);
    }
  }
  if (keys.size === 0) return new Map();
  const rows = getOrm()
    .select({
      merchantKey: merchantCategories.merchantKey,
      categoryId: merchantCategories.categoryId,
      kind: merchantCategories.kind,
      source: merchantCategories.source,
    })
    .from(merchantCategories)
    .where(
      and(
        eq(merchantCategories.workspaceId, workspaceId),
        inArray(merchantCategories.merchantKey, Array.from(keys)),
      ),
    )
    .all();
  const lookupByKey = new Map<string, MerchantMapping>();
  for (const r of rows) lookupByKey.set(r.merchantKey, r);
  const result = new Map<string, MerchantMapping>();
  for (const [description, key] of byKey) {
    const m = lookupByKey.get(key);
    if (m) result.set(description, m);
  }
  return result;
}

export function recordMerchantCategory(
  workspaceId: number,
  description: string,
  categoryId: number,
  kind: CategoryKind,
  source: "user" | "approved-ai",
): void {
  const key = normalizeMerchant(description);
  if (!key) return;
  getOrm()
    .insert(merchantCategories)
    .values({ workspaceId, merchantKey: key, categoryId, kind, source, hitCount: 0 })
    .onConflictDoUpdate({
      target: [merchantCategories.workspaceId, merchantCategories.merchantKey],
      set: {
        categoryId: sql`excluded.category_id`,
        kind: sql`excluded.kind`,
        source: sql`CASE
           WHEN ${merchantCategories.source} = 'user' AND excluded.source = 'approved-ai'
             THEN 'user'
           ELSE excluded.source
         END`,
        updatedAt: sql`datetime('now')`,
      },
    })
    .run();
}

export function incrementMerchantHits(workspaceId: number, merchantKeys: string[]): void {
  if (merchantKeys.length === 0) return;
  const orm = getOrm();
  orm.transaction((tx) => {
    for (const k of merchantKeys) {
      tx.update(merchantCategories)
        .set({ hitCount: sql`${merchantCategories.hitCount} + 1` })
        .where(
          and(
            eq(merchantCategories.workspaceId, workspaceId),
            eq(merchantCategories.merchantKey, k),
          ),
        )
        .run();
    }
  });
}
