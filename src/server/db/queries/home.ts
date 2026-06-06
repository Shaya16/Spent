import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomeRecentTransaction,
} from "@/lib/types";
import { BANK_PROVIDERS } from "@/lib/types";
import { toLocalISODate } from "../../lib/date-utils";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { bankCredentials, syncRuns } from "../schema";

export function getCashFlow(workspaceId: number, from: string, to: string): HomeCashFlow {
  const db = getDb();
  const income = db
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND status = 'completed' AND kind = 'income' AND is_excluded = 0`,
    )
    .get(workspaceId, from, to) as { total: number };
  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND status = 'completed' AND kind = 'expense' AND is_excluded = 0`,
    )
    .get(workspaceId, from, to) as { total: number };
  return {
    income: income.total,
    expenses: expenses.total,
    net: income.total - expenses.total,
  };
}

export function getHistoricalTrend(
  workspaceId: number,
  monthsBack: number,
): HomeHistoricalTrendPoint[] {
  const db = getDb();
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: start.toLocaleDateString("en-US", { month: "short" }),
      from: toLocalISODate(start),
      to: toLocalISODate(end),
    });
  }

  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total
     FROM transactions
     WHERE workspace_id = ? AND date >= ? AND date <= ?
       AND status = 'completed' AND kind = 'expense' AND is_excluded = 0`,
  );

  return months.map((m) => {
    const row = stmt.get(workspaceId, m.from, m.to) as { total: number };
    return {
      month: m.key,
      label: m.label,
      total: row.total,
      isCurrent: m.key === currentMonthKey,
    };
  });
}

export function getRecentTransactionsForHome(
  workspaceId: number,
  limit: number,
): HomeRecentTransaction[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.date, t.description, t.charged_amount as chargedAmount,
              t.charged_currency as chargedCurrency, t.kind,
              c.name as categoryName, c.color as categoryColor
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.kind != 'transfer'
         AND t.is_excluded = 0
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as Array<{
    id: number;
    date: string;
    description: string;
    chargedAmount: number;
    chargedCurrency: string | null;
    kind: "expense" | "income" | "transfer";
    categoryName: string | null;
    categoryColor: string | null;
  }>;
  return rows;
}

export function getNeedsAttentionCounts(workspaceId: number): HomeNeedsAttention {
  const db = getDb();
  const uncategorized = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND category_id IS NULL AND kind = 'expense' AND status = 'completed'
         AND is_excluded = 0`,
    )
    .get(workspaceId) as { count: number };
  const lowConfidence = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND ai_confidence IS NOT NULL AND ai_confidence < 0.5
         AND category_source = 'ai' AND status = 'completed' AND is_excluded = 0`,
    )
    .get(workspaceId) as { count: number };
  const flagged = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND needs_review = 1 AND status = 'completed' AND is_excluded = 0`,
    )
    .get(workspaceId) as { count: number };
  return {
    uncategorized: uncategorized.count,
    lowConfidence: lowConfidence.count,
    flagged: flagged.count,
  };
}

export function getBankHealth(workspaceId: number): HomeBankHealthItem[] {
  const orm = getOrm();
  const creds = orm
    .select({ provider: bankCredentials.provider })
    .from(bankCredentials)
    .where(eq(bankCredentials.workspaceId, workspaceId))
    .orderBy(asc(bankCredentials.provider))
    .all();

  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return creds.map(({ provider }) => {
    const latest = orm
      .select({
        status: syncRuns.status,
        completedAt: syncRuns.completedAt,
        errorMessage: syncRuns.errorMessage,
      })
      .from(syncRuns)
      .where(and(eq(syncRuns.workspaceId, workspaceId), eq(syncRuns.provider, provider)))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .get();
    const providerInfo = BANK_PROVIDERS.find((p) => p.id === provider);
    const providerName = providerInfo?.name ?? provider;

    if (!latest) {
      return {
        provider,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    if (latest.status === "failed") {
      return {
        provider,
        providerName,
        lastSyncAt: latest.completedAt,
        status: "error",
        errorMessage: latest.errorMessage,
      };
    }

    if (!latest.completedAt) {
      return {
        provider,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    const ageMs = now - new Date(`${latest.completedAt}Z`).getTime();
    const status: "ok" | "stale" = ageMs > staleThresholdMs ? "stale" : "ok";
    return {
      provider,
      providerName,
      lastSyncAt: latest.completedAt,
      status,
      errorMessage: null,
    };
  });
}

// Category breakdown for the home screen now lives in the insight engine
// (src/server/insights/engine.ts), which rolls leaves to parents and attaches
// month-over-month deltas. Snapshot-with-budget is intentionally gone.
