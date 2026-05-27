import "server-only";

import type { ExcludedMerchant } from "@/lib/types";
import { getDb } from "../index";

interface RawExcludedMerchantRow {
  id: number;
  provider: string;
  merchant_key: string;
  created_at: string;
}

function mapRow(row: RawExcludedMerchantRow): ExcludedMerchant {
  return {
    id: row.id,
    provider: row.provider,
    merchantKey: row.merchant_key,
    createdAt: row.created_at,
  };
}

export function listExcludedMerchants(workspaceId: number): ExcludedMerchant[] {
  const rows = getDb()
    .prepare(
      `SELECT id, provider, merchant_key, created_at
       FROM excluded_merchants
       WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(workspaceId) as RawExcludedMerchantRow[];
  return rows.map(mapRow);
}

export function addExcludedMerchant(
  workspaceId: number,
  provider: string,
  merchantKey: string,
): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO excluded_merchants (workspace_id, provider, merchant_key)
       VALUES (?, ?, ?)`,
    )
    .run(workspaceId, provider, merchantKey);
}

export function deleteExcludedMerchant(workspaceId: number, id: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM excluded_merchants WHERE workspace_id = ? AND id = ?`)
    .run(workspaceId, id);
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
  getDb()
    .prepare(
      `UPDATE transactions
       SET is_excluded = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    )
    .run(excluded ? 1 : 0, workspaceId, id);
}
