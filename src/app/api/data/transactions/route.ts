import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index";

export async function DELETE() {
  const db = getDb();

  const result = db.transaction(() => {
    const txCount = (
      db.prepare("SELECT COUNT(*) as c FROM transactions").get() as {
        c: number;
      }
    ).c;
    const syncCount = (
      db.prepare("SELECT COUNT(*) as c FROM sync_runs").get() as { c: number }
    ).c;
    const memoryCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM merchant_categories")
        .get() as { c: number }
    ).c;

    db.exec("DELETE FROM transactions");
    db.exec("DELETE FROM sync_runs");
    db.exec("DELETE FROM merchant_categories");
    db.exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'sync_runs', 'merchant_categories')"
    );

    return { txCount, syncCount, memoryCount };
  })();

  return NextResponse.json({
    success: true,
    deleted: result,
  });
}
