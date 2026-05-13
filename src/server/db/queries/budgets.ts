import "server-only";

import { getDb } from "../index";
import { toLocalISODate } from "../../lib/date-utils";

export interface BudgetRow {
  categoryId: number;
  monthlyAmount: number;
  isAuto: boolean;
}

export function getAllBudgets(): BudgetRow[] {
  const rows = getDb()
    .prepare(
      `SELECT category_id as categoryId, monthly_amount as monthlyAmount, is_auto as isAuto
       FROM budgets`
    )
    .all() as { categoryId: number; monthlyAmount: number; isAuto: number }[];
  return rows.map((r) => ({
    categoryId: r.categoryId,
    monthlyAmount: r.monthlyAmount,
    isAuto: r.isAuto === 1,
  }));
}

export function getBudgetForCategory(
  categoryId: number
): BudgetRow | null {
  const row = getDb()
    .prepare(
      `SELECT category_id as categoryId, monthly_amount as monthlyAmount, is_auto as isAuto
       FROM budgets WHERE category_id = ?`
    )
    .get(categoryId) as
    | { categoryId: number; monthlyAmount: number; isAuto: number }
    | undefined;
  if (!row) return null;
  return {
    categoryId: row.categoryId,
    monthlyAmount: row.monthlyAmount,
    isAuto: row.isAuto === 1,
  };
}

export function setBudget(
  categoryId: number,
  amount: number,
  isAuto = false
): void {
  getDb()
    .prepare(
      `INSERT INTO budgets (category_id, monthly_amount, is_auto, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(category_id) DO UPDATE SET
         monthly_amount = excluded.monthly_amount,
         is_auto = excluded.is_auto,
         updated_at = excluded.updated_at`
    )
    .run(categoryId, amount, isAuto ? 1 : 0);
}

export function deleteBudget(categoryId: number): void {
  getDb().prepare("DELETE FROM budgets WHERE category_id = ?").run(categoryId);
}

interface AutoSpend {
  categoryId: number;
  amount: number;
}

/**
 * Compute auto-budget defaults from a past calendar month's actual spend.
 * Used when a category has no explicit budget set.
 */
export function getAutoBudgetSource(
  monthOffset: number = -1
): AutoSpend[] {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset);
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = toLocalISODate(new Date(year, month, 1));
  const to = toLocalISODate(new Date(year, month + 1, 0));

  return getDb()
    .prepare(
      `SELECT category_id as categoryId, SUM(ABS(charged_amount)) as amount
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(from, to) as AutoSpend[];
}
