import "server-only";

import { getDb } from "../index";
import type { CredentialAccount } from "@/lib/types";

/**
 * Distinct accounts (cards / bank accounts) seen in transactions for one
 * credential, with their current monitoring state.
 */
export function listCredentialAccounts(
  workspaceId: number,
  credentialId: number
): CredentialAccount[] {
  const rows = getDb()
    .prepare(
      `SELECT t.account_number as accountNumber,
              COUNT(*) as transactionCount,
              EXISTS (
                SELECT 1 FROM excluded_accounts ea
                WHERE ea.workspace_id = t.workspace_id
                  AND ea.credential_id = t.credential_id
                  AND ea.account_number = t.account_number
              ) as excluded
       FROM transactions t
       WHERE t.workspace_id = ? AND t.credential_id = ?
       GROUP BY t.account_number
       ORDER BY t.account_number`
    )
    .all(workspaceId, credentialId) as Array<
    Omit<CredentialAccount, "excluded"> & { excluded: 0 | 1 }
  >;
  return rows.map((r) => ({ ...r, excluded: r.excluded === 1 }));
}

/**
 * Toggles monitoring for one account. Excluding adds a rule and hides all
 * existing transactions of that account; re-including removes the rule and
 * unhides them.
 */
export function setAccountExcluded(
  workspaceId: number,
  credentialId: number,
  accountNumber: string,
  excluded: boolean
): void {
  const db = getDb();
  db.transaction(() => {
    if (excluded) {
      db.prepare(
        `INSERT OR IGNORE INTO excluded_accounts (workspace_id, credential_id, account_number)
         VALUES (?, ?, ?)`
      ).run(workspaceId, credentialId, accountNumber);
    } else {
      db.prepare(
        `DELETE FROM excluded_accounts
         WHERE workspace_id = ? AND credential_id = ? AND account_number = ?`
      ).run(workspaceId, credentialId, accountNumber);
    }
    db.prepare(
      `UPDATE transactions
       SET is_excluded = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND credential_id = ? AND account_number = ?
         AND is_excluded = ?`
    ).run(
      excluded ? 1 : 0,
      workspaceId,
      credentialId,
      accountNumber,
      excluded ? 0 : 1
    );
  })();
}

/**
 * Flags all rows just inserted by the given sync run that belong to an
 * excluded account. Called once per sync immediately after insertTransactions
 * returns, alongside the merchant rules.
 */
export function applyAccountRulesToSyncRun(
  workspaceId: number,
  syncRunId: number
): number {
  const result = getDb()
    .prepare(
      `UPDATE transactions
       SET is_excluded = 1, updated_at = datetime('now')
       WHERE workspace_id = ?
         AND sync_run_id = ?
         AND is_excluded = 0
         AND EXISTS (
           SELECT 1 FROM excluded_accounts ea
           WHERE ea.workspace_id = transactions.workspace_id
             AND ea.credential_id = transactions.credential_id
             AND ea.account_number = transactions.account_number
         )`
    )
    .run(workspaceId, syncRunId);
  return result.changes;
}
