import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import type { SyncRun } from "@/lib/types";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { syncRuns } from "../schema";

export function createSyncRun(
  workspaceId: number,
  provider: string,
  credentialId: number,
  scrapeFromDate: string,
): number {
  const result = getOrm()
    .insert(syncRuns)
    .values({
      workspaceId,
      provider,
      credentialId,
      startedAt: sql`datetime('now')`,
      status: "running",
      scrapeFromDate,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export function completeSyncRun(id: number, added: number, updated: number): void {
  getOrm()
    .update(syncRuns)
    .set({
      status: "completed",
      completedAt: sql`datetime('now')`,
      transactionsAdded: added,
      transactionsUpdated: updated,
    })
    .where(eq(syncRuns.id, id))
    .run();
}

export function failSyncRun(id: number, errorMessage: string): void {
  getOrm()
    .update(syncRuns)
    .set({
      status: "failed",
      completedAt: sql`datetime('now')`,
      errorMessage,
    })
    .where(eq(syncRuns.id, id))
    .run();
}

interface ProviderStats {
  provider: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  transactionCount: number;
}

export function getCredentialStats(
  workspaceId: number,
  credentialId: number,
  provider: string,
): ProviderStats {
  const db = getDb();
  const lastRun = db
    .prepare(
      `SELECT completed_at, status FROM sync_runs
       WHERE workspace_id = ? AND credential_id = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(workspaceId, credentialId) as { completed_at: string; status: string } | undefined;
  const txnCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND credential_id = ?`,
    )
    .get(workspaceId, credentialId) as { count: number };
  return {
    provider,
    lastSyncAt: lastRun?.completed_at ?? null,
    lastSyncStatus: lastRun?.status ?? null,
    transactionCount: txnCount.count,
  };
}

export function getLastSyncRun(workspaceId: number, provider?: string): SyncRun | null {
  const row = getOrm()
    .select()
    .from(syncRuns)
    .where(
      provider
        ? and(eq(syncRuns.workspaceId, workspaceId), eq(syncRuns.provider, provider))
        : eq(syncRuns.workspaceId, workspaceId),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .get();

  if (!row) return null;

  return mapSyncRun(row);
}

type SyncRunRow = typeof syncRuns.$inferSelect;

function mapSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    provider: row.provider,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as SyncRun["status"],
    errorMessage: row.errorMessage,
    transactionsAdded: row.transactionsAdded ?? 0,
    transactionsUpdated: row.transactionsUpdated ?? 0,
    scrapeFromDate: row.scrapeFromDate,
    createdAt: row.createdAt,
  };
}
