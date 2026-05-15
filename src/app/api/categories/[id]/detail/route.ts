import { NextResponse } from "next/server";
import {
  queryTransactions,
  getCategorySpendByDay,
  getTopMerchantsForCategory,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { getAllBudgets, getAutoBudgetAverage } from "@/server/db/queries/budgets";
import { toLocalISODate } from "@/server/lib/date-utils";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { BudgetSource } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = toLocalISODate(
    new Date(now.getFullYear(), now.getMonth() + 1, 0)
  );
  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;

  const fromDate = new Date(from);
  const prevMonthStart = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth() - 1,
    1
  );
  const prevMonthEnd = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    0
  );
  const prevFrom = toLocalISODate(prevMonthStart);
  const prevTo = toLocalISODate(prevMonthEnd);

  const allCategories = getAllCategories(workspaceId);
  const category = allCategories.find((c) => c.id === categoryId);
  if (!category) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Identify children if this category is a parent.
  const children = allCategories.filter((c) => c.parentId === categoryId);
  const isParent = children.length > 0;

  // For parents, aggregate across all child ids. For leaves, behave as before.
  const targetIds = isParent ? children.map((c) => c.id) : [categoryId];

  // Daily spend: sum per-day across the target ids.
  const perTargetDaily = targetIds.map((tid) =>
    getCategorySpendByDay(workspaceId, tid, from, to)
  );
  const dailyMap = new Map<string, number>();
  for (const series of perTargetDaily) {
    for (const d of series) {
      dailyMap.set(d.date, (dailyMap.get(d.date) ?? 0) + d.amount);
    }
  }
  const dailySpend = Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const spent = dailySpend.reduce((sum, d) => sum + d.amount, 0);

  const allBudgets = getAllBudgets(workspaceId);
  const allAuto = getAutoBudgetAverage(workspaceId, 3);

  const isTracking = category.budgetMode === "tracking";
  let budget = 0;
  let isAutoBudget = false;
  let budgetSource: BudgetSource = "leaf";

  if (isParent) {
    const ownExplicit = allBudgets.find((b) => b.categoryId === categoryId);
    const usesOwn = !isTracking && ownExplicit !== undefined;
    if (usesOwn && ownExplicit) {
      budget = ownExplicit.monthlyAmount;
      isAutoBudget = false;
      budgetSource = "own";
    } else {
      budget = children.reduce((sum, child) => {
        if (child.budgetMode === "tracking") return sum;
        const explicit = allBudgets.find((b) => b.categoryId === child.id);
        const auto = allAuto.find((a) => a.categoryId === child.id)?.amount ?? 0;
        return sum + (explicit?.monthlyAmount ?? auto);
      }, 0);
      isAutoBudget = children.every((child) => {
        const explicit = allBudgets.find((b) => b.categoryId === child.id);
        return !explicit;
      });
      budgetSource = "rollup";
    }
  } else {
    const explicitBudget = allBudgets.find(
      (b) => b.categoryId === categoryId
    );
    const autoSource = allAuto.find((s) => s.categoryId === categoryId);
    const autoAmount = autoSource?.amount ?? 0;
    budget = isTracking ? 0 : explicitBudget?.monthlyAmount ?? autoAmount;
    isAutoBudget = !isTracking && !explicitBudget;
    budgetSource = "leaf";
  }

  // vsTypical: parent rolls up children's typicals when not in own-budget mode.
  let vsTypical: { typical: number; percentDiff: number } | null = null;
  if (isParent) {
    if (budgetSource !== "own") {
      const typical = children.reduce(
        (s, c) =>
          s + (allAuto.find((a) => a.categoryId === c.id)?.amount ?? 0),
        0
      );
      if (typical > 0) {
        vsTypical = {
          typical,
          percentDiff: ((spent - typical) / typical) * 100,
        };
      }
    }
  } else {
    const autoAmount =
      allAuto.find((s) => s.categoryId === categoryId)?.amount ?? 0;
    vsTypical =
      isTracking && autoAmount > 0
        ? {
            typical: autoAmount,
            percentDiff: ((spent - autoAmount) / autoAmount) * 100,
          }
        : null;
  }

  const prevPerTarget = targetIds.map((tid) =>
    getCategorySpendByDay(workspaceId, tid, prevFrom, prevTo)
  );
  let prevSpent = 0;
  for (const series of prevPerTarget) {
    for (const d of series) prevSpent += d.amount;
  }
  const vsLastMonth =
    prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;

  const filterKind = category.kind === "income" ? "income" : "expense";

  const { transactions, total: transactionCount } = queryTransactions(
    workspaceId,
    {
      from,
      to,
      ...(isParent ? { categoryIds: targetIds } : { category: categoryId }),
      kind: filterKind,
      sort: "date",
      order: "desc",
      limit: 50,
    }
  );

  const needsReviewTransactions = transactions.filter((t) => t.needsReview);

  // Top merchants: for parents, union across children and re-rank.
  const topMerchants = isParent
    ? aggregateTopMerchants(
        children.map((c) =>
          getTopMerchantsForCategory(workspaceId, c.id, from, to, 12)
        )
      )
    : getTopMerchantsForCategory(workspaceId, categoryId, from, to, 6);

  const avgPerTransaction = transactionCount > 0 ? spent / transactionCount : 0;

  // For parent: build a children breakdown with each child's spend/budget.
  const childrenBreakdown = isParent
    ? children
        .map((c) => {
          const childSpent = (() => {
            const series = perTargetDaily[targetIds.indexOf(c.id)];
            return series.reduce((s, d) => s + d.amount, 0);
          })();
          const childExplicit = allBudgets.find(
            (b) => b.categoryId === c.id
          );
          const childAuto =
            allAuto.find((a) => a.categoryId === c.id)?.amount ?? 0;
          const childIsTracking = c.budgetMode === "tracking";
          const childBudget = childIsTracking
            ? 0
            : childExplicit?.monthlyAmount ?? childAuto;
          return {
            id: c.id,
            name: c.name,
            color: c.color,
            icon: c.icon,
            spent: childSpent,
            budget: childBudget,
            budgetMode: c.budgetMode,
            isAutoBudget: !childIsTracking && !childExplicit,
            percentSpent:
              childBudget > 0 ? (childSpent / childBudget) * 100 : 0,
          };
        })
        .sort((a, b) => b.spent - a.spent)
    : null;

  return NextResponse.json({
    category: {
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      kind: category.kind,
      budgetMode: category.budgetMode,
      isParent,
    },
    spent,
    budget,
    isAutoBudget,
    budgetSource,
    vsTypical,
    remaining: Math.max(0, budget - spent),
    percentSpent: budget > 0 ? (spent / budget) * 100 : 0,
    transactionCount,
    avgPerTransaction,
    vsLastMonth,
    prevSpent,
    prevPeriodLabel: prevMonthStart.toLocaleDateString("en-US", {
      month: "long",
    }),
    dailySpend,
    topMerchants,
    transactions,
    needsReviewTransactions,
    needsReviewCount: needsReviewTransactions.length,
    period: { from, to },
    children: childrenBreakdown,
  });
}

function aggregateTopMerchants(
  perCategory: Array<{ merchant: string; amount: number; count: number }[]>
): { merchant: string; amount: number; count: number }[] {
  const merged = new Map<string, { amount: number; count: number }>();
  for (const list of perCategory) {
    for (const m of list) {
      const cur = merged.get(m.merchant) ?? { amount: 0, count: 0 };
      cur.amount += m.amount;
      cur.count += m.count;
      merged.set(m.merchant, cur);
    }
  }
  return Array.from(merged.entries())
    .map(([merchant, v]) => ({ merchant, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
}
