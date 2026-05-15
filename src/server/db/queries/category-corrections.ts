import "server-only";

import { getDb } from "../index";
import { normalizeMerchant } from "../../lib/merchant-memory";
import type { PastCorrection } from "@/server/ai/types";

export function recordCorrection(
  workspaceId: number,
  description: string,
  aiCategoryId: number,
  userCategoryId: number,
  kind: "expense" | "income"
): void {
  const key = normalizeMerchant(description);
  if (!key) return;
  getDb()
    .prepare(
      `INSERT INTO category_corrections
         (workspace_id, merchant_key, description, ai_category_id, user_category_id, kind)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, merchant_key, ai_category_id) DO UPDATE SET
         user_category_id = excluded.user_category_id,
         description = excluded.description,
         kind = excluded.kind,
         created_at = datetime('now')`
    )
    .run(workspaceId, key, description, aiCategoryId, userCategoryId, kind);
}

export function getRecentCorrections(
  workspaceId: number,
  kind: "expense" | "income",
  limit = 30
): PastCorrection[] {
  const rows = getDb()
    .prepare(
      `SELECT cc.description       AS description,
              w.name                AS wrongCategory,
              r.name                AS correctCategory
         FROM category_corrections cc
         JOIN categories w ON w.id = cc.ai_category_id
         JOIN categories r ON r.id = cc.user_category_id
        WHERE cc.workspace_id = ? AND cc.kind = ?
        ORDER BY cc.created_at DESC
        LIMIT ?`
    )
    .all(workspaceId, kind, limit) as PastCorrection[];
  return rows;
}
