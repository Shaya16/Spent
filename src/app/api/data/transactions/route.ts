import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index";
import { getOrm } from "@/server/db/orm";
import { merchantCategories, syncRuns, transactions } from "@/server/db/schema";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function DELETE(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const db = getDb();
  const orm = getOrm();

  const result = db.transaction(() => {
    const txCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM transactions WHERE workspace_id = ?")
        .get(workspaceId) as { c: number }
    ).c;
    const syncCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM sync_runs WHERE workspace_id = ?")
        .get(workspaceId) as { c: number }
    ).c;
    const memoryCount = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM merchant_categories WHERE workspace_id = ?"
        )
        .get(workspaceId) as { c: number }
    ).c;

    orm.delete(transactions).where(eq(transactions.workspaceId, workspaceId)).run();
    orm.delete(syncRuns).where(eq(syncRuns.workspaceId, workspaceId)).run();
    orm.delete(merchantCategories).where(eq(merchantCategories.workspaceId, workspaceId)).run();

    return { txCount, syncCount, memoryCount };
  })();

  return NextResponse.json({
    success: true,
    deleted: result,
  });
}
