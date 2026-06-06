import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import type { ExcludedMerchant } from "@/lib/types";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { excludedMerchants, transactions } from "../schema";

export function listExcludedMerchants(workspaceId: number): ExcludedMerchant[] {
  const rows = getOrm()
    .select({
      id: excludedMerchants.id,
      provider: excludedMerchants.provider,
      merchantKey: excludedMerchants.merchantKey,
      createdAt: excludedMerchants.createdAt,
    })
    .from(excludedMerchants)
    .where(eq(excludedMerchants.workspaceId, workspaceId))
    .orderBy(desc(excludedMerchants.createdAt), desc(excludedMerchants.id))
    .all();
  return rows;
}

export function addExcludedMerchant(
  workspaceId: number,
  provider: string,
  merchantKey: string,
): void {
  getOrm()
    .insert(excludedMerchants)
    .values({ workspaceId, provider, merchantKey })
    .onConflictDoNothing({
      target: [
        excludedMerchants.workspaceId,
        excludedMerchants.provider,
        excludedMerchants.merchantKey,
      ],
    })
    .run();
}

export function deleteExcludedMerchant(workspaceId: number, id: number): boolean {
  const result = getOrm()
    .delete(excludedMerchants)
    .where(and(eq(excludedMerchants.workspaceId, workspaceId), eq(excludedMerchants.id, id)))
    .run();
  return result.changes > 0;
}

export function deleteExcludedMerchantByKey(
  workspaceId: number,
  provider: string,
  merchantKey: string,
): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM excluded_merchants
       WHERE workspace_id = ? AND provider = ? AND merchant_key = ?`,
    )
    .run(workspaceId, provider, merchantKey);
  return result.changes > 0;
}

/**
 * Flags all rows just inserted by the given sync run that match an existing
 * excluded_merchants rule. Called once per sync immediately after
 * insertTransactions returns. Cheap indexed join.
 */
export function applyMerchantRulesToSyncRun(workspaceId: number, syncRunId: number): number {
  const result = getDb()
    .prepare(
      `UPDATE transactions
       SET is_excluded = 1, updated_at = datetime('now')
       WHERE workspace_id = ?
         AND sync_run_id = ?
         AND is_excluded = 0
         AND EXISTS (
           SELECT 1 FROM excluded_merchants em
           WHERE em.workspace_id = transactions.workspace_id
             AND em.provider = transactions.provider
             AND em.merchant_key = transactions.description
         )`,
    )
    .run(workspaceId, syncRunId);
  return result.changes;
}

/**
 * Flips is_excluded for a single transaction. Used by the row "Hide / Show"
 * action. Does NOT touch the rules table.
 */
export function setTransactionExcluded(workspaceId: number, id: number, excluded: boolean): void {
  getOrm()
    .update(transactions)
    .set({ isExcluded: excluded ? 1 : 0, updatedAt: sql`datetime('now')` })
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)))
    .run();
}
