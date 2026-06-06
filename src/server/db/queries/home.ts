import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeCategorySnapshotItem,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomeRecentTransaction,
} from "@/lib/types";
import { BANK_PROVIDERS } from "@/lib/types";
import { toLocalISODate } from "../../lib/date-utils";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { bankCredentials, budgets, categories, syncRuns } from "../schema";

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

export function getCategorySnapshot(
  workspaceId: number,
  from: string,
  to: string,
  limit: number,
): HomeCategorySnapshotItem[] {
  const orm = getOrm();

  const categoryRows = orm
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      color: categories.color,
    })
    .from(categories)
    .where(and(eq(categories.workspaceId, workspaceId), eq(categories.kind, "expense")))
    .all();

  const parentIds = new Set<number>();
  for (const c of categoryRows) {
    if (c.parentId != null) parentIds.add(c.parentId);
  }

  const spendRows = getDb()
    .prepare(
      `SELECT category_id as categoryId, SUM(ABS(charged_amount)) as amount
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND status = 'completed' AND kind = 'expense'
         AND category_id IS NOT NULL AND is_excluded = 0
       GROUP BY category_id`,
    )
    .all(workspaceId, from, to) as Array<{ categoryId: number; amount: number }>;

  const budgetRows = orm
    .select({
      categoryId: budgets.categoryId,
      monthlyAmount: budgets.monthlyAmount,
    })
    .from(budgets)
    .where(eq(budgets.workspaceId, workspaceId))
    .all();

  const budgetByCategory = new Map<number, number>();
  for (const b of budgetRows) budgetByCategory.set(b.categoryId, b.monthlyAmount);

  // Roll each leaf's spend up to its parent if it has one, else under its own id.
  const rolledSpend = new Map<number, number>();
  const rolledBudget = new Map<number, number>();

  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

  for (const row of spendRows) {
    const cat = categoryById.get(row.categoryId);
    if (!cat) continue;
    const key = cat.parentId ?? cat.id;
    rolledSpend.set(key, (rolledSpend.get(key) ?? 0) + row.amount);
  }

  // Roll up budgets the same way. Parent's explicit budget takes precedence
  // over the sum of children when it exists.
  for (const cat of categoryRows) {
    const explicit = budgetByCategory.get(cat.id);
    if (explicit == null) continue;
    const key = cat.parentId ?? cat.id;
    if (cat.parentId == null && parentIds.has(cat.id)) {
      // This is a parent with its own explicit budget — use it directly.
      rolledBudget.set(key, explicit);
    } else {
      // Leaf budget: only add if parent doesn't have its own explicit budget.
      const parentHasOwnBudget = cat.parentId != null && budgetByCategory.has(cat.parentId);
      if (parentHasOwnBudget) continue;
      rolledBudget.set(key, (rolledBudget.get(key) ?? 0) + explicit);
    }
  }

  const items: HomeCategorySnapshotItem[] = [];
  for (const [key, spent] of rolledSpend) {
    const cat = categoryById.get(key);
    if (!cat) continue;
    const budget = rolledBudget.get(key) ?? 0;
    items.push({
      categoryId: key,
      name: cat.name,
      color: cat.color,
      spent,
      budget,
      percentSpent: budget > 0 ? (spent / budget) * 100 : 0,
    });
  }

  items.sort((a, b) => b.spent - a.spent);
  return items.slice(0, limit);
}
