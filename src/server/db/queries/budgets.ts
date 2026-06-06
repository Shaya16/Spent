import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { toLocalISODate } from "../../lib/date-utils";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { budgets } from "../schema";

export interface BudgetRow {
  categoryId: number;
  monthlyAmount: number;
  isAuto: boolean;
}

export function getAllBudgets(workspaceId: number): BudgetRow[] {
  const rows = getOrm()
    .select({
      categoryId: budgets.categoryId,
      monthlyAmount: budgets.monthlyAmount,
      isAuto: budgets.isAuto,
    })
    .from(budgets)
    .where(eq(budgets.workspaceId, workspaceId))
    .all();
  return rows.map((r) => ({
    categoryId: r.categoryId,
    monthlyAmount: r.monthlyAmount,
    isAuto: r.isAuto === 1,
  }));
}

export function getBudgetForCategory(workspaceId: number, categoryId: number): BudgetRow | null {
  const row = getOrm()
    .select({
      categoryId: budgets.categoryId,
      monthlyAmount: budgets.monthlyAmount,
      isAuto: budgets.isAuto,
    })
    .from(budgets)
    .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.categoryId, categoryId)))
    .get();
  if (!row) return null;
  return {
    categoryId: row.categoryId,
    monthlyAmount: row.monthlyAmount,
    isAuto: row.isAuto === 1,
  };
}

export function setBudget(
  workspaceId: number,
  categoryId: number,
  amount: number,
  isAuto = false,
): void {
  getOrm()
    .insert(budgets)
    .values({
      workspaceId,
      categoryId,
      monthlyAmount: amount,
      isAuto: isAuto ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [budgets.workspaceId, budgets.categoryId],
      set: {
        monthlyAmount: amount,
        isAuto: isAuto ? 1 : 0,
        updatedAt: sql`datetime('now')`,
      },
    })
    .run();
}

export function deleteBudget(workspaceId: number, categoryId: number): void {
  getOrm()
    .delete(budgets)
    .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.categoryId, categoryId)))
    .run();
}

interface AutoSpend {
  categoryId: number;
  amount: number;
}

/**
 * Auto-budget default: average monthly spend across the last N completed
 * calendar months (excluding the current month). Divides by months *available*,
 * so a fresh DB with one month of history returns that month's spend, not
 * one-third of it.
 */
export function getAutoBudgetAverage(workspaceId: number, monthsBack: number = 3): AutoSpend[] {
  const now = new Date();
  const periods: { from: string; to: string }[] = [];
  for (let i = 1; i <= monthsBack; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    periods.push({
      from: toLocalISODate(start),
      to: toLocalISODate(end),
    });
  }

  const db = getDb();
  const totals = new Map<number, number>();
  const monthsSeen = new Map<number, number>();

  for (const { from, to } of periods) {
    const rows = db
      .prepare(
        `SELECT category_id as categoryId, SUM(ABS(charged_amount)) as amount
         FROM transactions
         WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND category_id IS NOT NULL
         GROUP BY category_id`,
      )
      .all(workspaceId, from, to) as AutoSpend[];

    for (const r of rows) {
      if (r.amount <= 0) continue;
      totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amount);
      monthsSeen.set(r.categoryId, (monthsSeen.get(r.categoryId) ?? 0) + 1);
    }
  }

  const result: AutoSpend[] = [];
  for (const [categoryId, total] of totals) {
    const months = monthsSeen.get(categoryId) ?? 1;
    result.push({ categoryId, amount: total / months });
  }
  return result;
}
