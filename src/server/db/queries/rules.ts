import "server-only";

import { getDb } from "../index";
import { applyRules, isSafeRegex, type Rule, type TxnKind } from "@/server/rules/engine";

export type NewRule = Omit<Rule, "id">;

export function listRules(workspaceId: number): Rule[] {
  return getDb()
    .prepare(
      `SELECT id, field, op, value, category_id as categoryId, kind
       FROM rules WHERE workspace_id = ? ORDER BY id`
    )
    .all(workspaceId)
    .map((r) => {
      const row = r as Rule & { categoryId: number | null; kind: TxnKind | null };
      return { ...row, categoryId: row.categoryId ?? undefined, kind: row.kind ?? undefined };
    });
}

export function createRule(workspaceId: number, rule: NewRule): number {
  if (rule.op === "regex" && !isSafeRegex(rule.value)) {
    throw new Error("Unsafe or invalid regex pattern");
  }
  return getDb()
    .prepare(
      `INSERT INTO rules (workspace_id, field, op, value, category_id, kind)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(workspaceId, rule.field, rule.op, rule.value, rule.categoryId ?? null, rule.kind ?? null)
    .lastInsertRowid as number;
}

export function deleteRule(workspaceId: number, id: number): void {
  getDb().prepare("DELETE FROM rules WHERE workspace_id = ? AND id = ?").run(workspaceId, id);
}

/** Applies rules to this run's rows the user has not categorized by hand. Returns how many rows changed. */
export function applyRulesToSyncRun(workspaceId: number, syncRunId: number): number {
  const rules = listRules(workspaceId);
  if (rules.length === 0) return 0;

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount, account_number as accountNumber
       FROM transactions
       WHERE workspace_id = ? AND sync_run_id = ? AND category_source IS NULL`
    )
    .all(workspaceId, syncRunId) as { id: number; description: string; chargedAmount: number; accountNumber: string }[];

  const update = db.prepare(
    `UPDATE transactions
     SET category_id = COALESCE(?, category_id),
         category_source = CASE WHEN ? IS NULL THEN category_source ELSE 'user' END,
         kind = COALESCE(?, kind),
         updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`
  );

  let changed = 0;
  db.transaction(() => {
    for (const row of rows) {
      const hit = applyRules(row, rules);
      if (!hit) continue;
      update.run(hit.categoryId ?? null, hit.categoryId ?? null, hit.kind ?? null, row.id, workspaceId);
      changed++;
    }
  })();
  return changed;
}
