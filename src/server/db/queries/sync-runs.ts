import "server-only";

import { getDb } from "../index";
import type { SyncRun } from "@/lib/types";

export function createSyncRun(
  provider: string,
  scrapeFromDate: string
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO sync_runs (provider, started_at, status, scrape_from_date)
       VALUES (?, datetime('now'), 'running', ?)`
    )
    .run(provider, scrapeFromDate);
  return Number(result.lastInsertRowid);
}

export function completeSyncRun(
  id: number,
  added: number,
  updated: number
): void {
  getDb()
    .prepare(
      `UPDATE sync_runs
       SET status = 'completed', completed_at = datetime('now'),
           transactions_added = ?, transactions_updated = ?
       WHERE id = ?`
    )
    .run(added, updated, id);
}

export function failSyncRun(id: number, errorMessage: string): void {
  getDb()
    .prepare(
      `UPDATE sync_runs
       SET status = 'failed', completed_at = datetime('now'), error_message = ?
       WHERE id = ?`
    )
    .run(errorMessage, id);
}

export function getLastSyncRun(provider?: string): SyncRun | null {
  const sql = provider
    ? `SELECT * FROM sync_runs WHERE provider = ? ORDER BY started_at DESC LIMIT 1`
    : `SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1`;

  const row = provider
    ? getDb().prepare(sql).get(provider)
    : getDb().prepare(sql).get();

  if (!row) return null;

  return mapSyncRun(row as SyncRunRow);
}

interface SyncRunRow {
  id: number;
  provider: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  error_message: string | null;
  transactions_added: number;
  transactions_updated: number;
  scrape_from_date: string;
  created_at: string;
}

function mapSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    provider: row.provider,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status as SyncRun["status"],
    errorMessage: row.error_message,
    transactionsAdded: row.transactions_added,
    transactionsUpdated: row.transactions_updated,
    scrapeFromDate: row.scrape_from_date,
    createdAt: row.created_at,
  };
}
