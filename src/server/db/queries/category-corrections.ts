import "server-only";

import { sql } from "drizzle-orm";
import type { PastCorrection } from "@/server/ai/types";
import { normalizeMerchant } from "../../lib/merchant-memory";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { categoryCorrections } from "../schema";

export function recordCorrection(
  workspaceId: number,
  description: string,
  aiCategoryId: number,
  userCategoryId: number,
  kind: "expense" | "income",
): void {
  const key = normalizeMerchant(description);
  if (!key) return;
  getOrm()
    .insert(categoryCorrections)
    .values({
      workspaceId,
      merchantKey: key,
      description,
      aiCategoryId,
      userCategoryId,
      kind,
    })
    .onConflictDoUpdate({
      target: [
        categoryCorrections.workspaceId,
        categoryCorrections.merchantKey,
        categoryCorrections.aiCategoryId,
      ],
      set: {
        userCategoryId,
        description,
        kind,
        createdAt: sql`datetime('now')`,
      },
    })
    .run();
}

export function getRecentCorrections(
  workspaceId: number,
  kind: "expense" | "income",
  limit = 30,
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
        LIMIT ?`,
    )
    .all(workspaceId, kind, limit) as PastCorrection[];
  return rows;
}
