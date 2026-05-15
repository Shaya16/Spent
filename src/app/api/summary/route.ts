import { NextResponse } from "next/server";
import {
  getMonthlySummary,
  getTopMerchants,
  getCategoryBreakdown,
  getPeriodTotal,
  getPeriodCount,
  getCategorySpendInRange,
  getTopMerchantPerCategory,
  getNeedsReviewCountByCategory,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import {
  getAllBudgets,
  getAutoBudgetAverage,
} from "@/server/db/queries/budgets";
import { getWorkspaceSetting } from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  computeStatus,
  daysInMonth,
  dayWithinMonth,
  daysUntil,
  nextPayday,
  pacePhrase,
} from "@/server/lib/pace";
import { toLocalISODate } from "@/server/lib/date-utils";
import type { BudgetSource, CategoryWithData } from "@/lib/types";

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = toLocalISODate(
    new Date(now.getFullYear(), now.getMonth() + 1, 0)
  );

  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;
  const months = Number(searchParams.get("months") ?? "12");

  const fromDate = parseISODate(from);
  const monthLabel = fromDate.toLocaleDateString("en-US", { month: "long" });
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const totalDays = daysInMonth(year, month);
  const today = new Date();
  const elapsedDays = Math.max(1, dayWithinMonth(today, year, month));
  const timeElapsedPercent = Math.min(100, (elapsedDays / totalDays) * 100);

  const paydayDay = Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1");
  const payday = nextPayday(today, paydayDay);
  const daysUntilPayday = Math.max(0, daysUntil(payday));

  // Compute previous month's range
  const prevMonthStart = new Date(year, month - 1, 1);
  const prevMonthEnd = new Date(year, month, 0);
  const prevFrom = toLocalISODate(prevMonthStart);
  const prevTo = toLocalISODate(prevMonthEnd);

  const categories = getAllCategories(workspaceId, "expense");
  const currentSpend = getCategorySpendInRange(workspaceId, from, to);
  const prevSpend = getCategorySpendInRange(workspaceId, prevFrom, prevTo);
  const topMerchants = getTopMerchantPerCategory(workspaceId, from, to);
  const explicitBudgets = getAllBudgets(workspaceId);
  const needsReviewCounts = getNeedsReviewCountByCategory(workspaceId, from, to);
  const needsReviewMap = new Map(
    needsReviewCounts.map((r) => [r.categoryId, r.count])
  );

  const currentMap = new Map(currentSpend.map((s) => [s.categoryId, s]));
  const prevMap = new Map(prevSpend.map((s) => [s.categoryId, s.amount]));
  const topMerchantMap = new Map(
    topMerchants.map((m) => [m.categoryId, m])
  );
  const budgetMap = new Map(
    explicitBudgets.map((b) => [b.categoryId, b])
  );

  // Identify parents (any category that is referenced as parent_id by at
  // least one other category). Parents get synthetic rollup rows.
  const parentIdSet = new Set<number>();
  const childrenByParent = new Map<number, typeof categories>();
  for (const c of categories) {
    if (c.parentId != null) {
      parentIdSet.add(c.parentId);
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }
  const parentNameById = new Map<number, string>();
  for (const c of categories) {
    if (parentIdSet.has(c.id)) parentNameById.set(c.id, c.name);
  }

  function leafRow(cat: (typeof categories)[number]): CategoryWithData {
    const spend = currentMap.get(cat.id);
    const spent = spend?.amount ?? 0;
    const count = spend?.count ?? 0;
    const prev = prevMap.get(cat.id) ?? null;
    const vsLastMonth =
      prev != null && prev > 0 ? ((spent - prev) / prev) * 100 : null;
    const topMerchant = topMerchantMap.get(cat.id)?.merchant ?? null;
    const needsReviewCount = needsReviewMap.get(cat.id) ?? 0;

    if (cat.budgetMode === "tracking") {
      return {
        categoryId: cat.id,
        parentId: cat.parentId,
        parentName: cat.parentId != null
          ? parentNameById.get(cat.parentId) ?? null
          : null,
        isParent: false,
        budgetSource: "leaf" satisfies BudgetSource,
        categoryName: cat.name,
        categoryColor: cat.color,
        categoryIcon: cat.icon,
        budgetMode: cat.budgetMode,
        spent,
        transactionCount: count,
        topMerchant,
        budget: 0,
        isAutoBudget: false,
        vsLastMonth,
        remaining: 0,
        perDayRemaining: null,
        percentSpent: 0,
        status: "on-track",
        needsReviewCount,
        vsTypical: null,
      };
    }

    const explicit = budgetMap.get(cat.id);
    const budget = explicit?.monthlyAmount ?? 0;
    const remaining = Math.max(0, budget - spent);
    const perDayRemaining =
      daysUntilPayday > 0 && remaining > 0
        ? remaining / daysUntilPayday
        : null;
    const percentSpent = budget > 0 ? (spent / budget) * 100 : 0;
    const status = computeStatus(spent, budget, timeElapsedPercent);
    return {
      categoryId: cat.id,
      parentId: cat.parentId,
      parentName: cat.parentId != null
        ? parentNameById.get(cat.parentId) ?? null
        : null,
      isParent: false,
      budgetSource: "leaf" satisfies BudgetSource,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      budgetMode: cat.budgetMode,
      spent,
      transactionCount: count,
      topMerchant,
      budget,
      isAutoBudget: false,
      vsLastMonth,
      remaining,
      perDayRemaining,
      percentSpent,
      status,
      needsReviewCount,
      vsTypical: null,
    };
  }

  // Build leaf rows for all non-parent categories. Parent rows do NOT
  // appear as leaves - they only appear as synthetic rollup rows.
  const leafRows: CategoryWithData[] = categories
    .filter((c) => !parentIdSet.has(c.id))
    .map(leafRow);
  const leafById = new Map(leafRows.map((r) => [r.categoryId, r]));

  // Build a parent rollup row per parent category. Aggregates over its
  // direct children's leaf rows.
  const parentRows: CategoryWithData[] = [];
  for (const parent of categories) {
    if (!parentIdSet.has(parent.id)) continue;
    const kids = childrenByParent.get(parent.id) ?? [];
    const kidRows = kids
      .map((k) => leafById.get(k.id))
      .filter((r): r is CategoryWithData => !!r);

    const spent = kidRows.reduce((s, r) => s + r.spent, 0);
    const transactionCount = kidRows.reduce(
      (s, r) => s + r.transactionCount,
      0
    );
    const needsReviewCount = kidRows.reduce(
      (s, r) => s + r.needsReviewCount,
      0
    );
    const prevTotal = kids.reduce(
      (s, k) => s + (prevMap.get(k.id) ?? 0),
      0
    );
    const vsLastMonth =
      prevTotal > 0 ? ((spent - prevTotal) / prevTotal) * 100 : null;

    // topMerchant: whichever child's top merchant has the largest spend
    let topMerchant: string | null = null;
    let topMerchantAmount = -Infinity;
    for (const k of kids) {
      const m = topMerchantMap.get(k.id);
      if (m && m.amount > topMerchantAmount) {
        topMerchantAmount = m.amount;
        topMerchant = m.merchant;
      }
    }

    // Budget: parent has its own explicit budget when in "budgeted" mode AND
    // a budget row exists for it. Otherwise roll up sum of budgeted children.
    const ownExplicit = budgetMap.get(parent.id);
    const usesOwn =
      parent.budgetMode === "budgeted" && ownExplicit !== undefined;
    let budget = 0;
    let budgetSource: BudgetSource = "rollup";
    if (usesOwn && ownExplicit) {
      budget = ownExplicit.monthlyAmount;
      budgetSource = "own";
    } else {
      budget = kidRows.reduce(
        (s, r) => (r.budgetMode === "budgeted" ? s + r.budget : s),
        0
      );
      budgetSource = "rollup";
    }

    const remaining = Math.max(0, budget - spent);
    const perDayRemaining =
      daysUntilPayday > 0 && remaining > 0 ? remaining / daysUntilPayday : null;
    const percentSpent = budget > 0 ? (spent / budget) * 100 : 0;
    const status = computeStatus(spent, budget, timeElapsedPercent);

    parentRows.push({
      categoryId: parent.id,
      parentId: null,
      parentName: null,
      isParent: true,
      budgetSource,
      childCount: kids.length,
      categoryName: parent.name,
      categoryColor: parent.color,
      categoryIcon: parent.icon,
      budgetMode: parent.budgetMode,
      spent,
      transactionCount,
      topMerchant,
      budget,
      isAutoBudget: false,
      vsLastMonth,
      remaining,
      perDayRemaining,
      percentSpent,
      status,
      needsReviewCount,
      vsTypical: null,
    });
  }

  const categoriesWithData: CategoryWithData[] = [...parentRows, ...leafRows];

  const periodTotal = getPeriodTotal(workspaceId, from, to);
  const transactionCount = getPeriodCount(workspaceId, from, to);

  // Hero total comes from the workspace-level monthly target. ALL spend
  // counts against it — tracking-mode is a per-category organizational tag
  // only and does not exclude spend from the hero verdict. Per-category
  // budgets continue to drive their own category cards independently.
  const monthlyTargetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
  const monthlyTargetParsed = monthlyTargetRaw != null ? Number(monthlyTargetRaw) : NaN;
  const monthlyTarget =
    Number.isFinite(monthlyTargetParsed) && monthlyTargetParsed > 0
      ? monthlyTargetParsed
      : 0;
  const totalBudget = monthlyTarget;
  const budgetedSpent = periodTotal;

  // Typical monthly spend for the facts-mode CTA: sum of 3-month
  // per-category rolling average, rounded to the nearest 100. Null when
  // there's no completed history yet.
  const autoSource = getAutoBudgetAverage(workspaceId, 3);
  const typicalSum = autoSource.reduce((s, r) => s + (r.amount ?? 0), 0);
  const typicalMonthly =
    typicalSum > 0 ? Math.round(typicalSum / 100) * 100 : null;

  const overallPercentSpent =
    totalBudget > 0 ? (periodTotal / totalBudget) * 100 : 0;
  const phrase = pacePhrase(
    periodTotal,
    budgetedSpent,
    totalBudget,
    timeElapsedPercent,
    monthLabel
  );

  // Format the date for hero header (e.g., "Tuesday, May 19")
  const todayLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return NextResponse.json({
    periodTotal,
    transactionCount,
    monthlySpend: getMonthlySummary(workspaceId, months),
    topMerchants: getTopMerchants(workspaceId, from, to),
    categoryBreakdown: getCategoryBreakdown(workspaceId, from, to),
    // New fields for the budgets dashboard:
    categoriesWithData,
    totalBudget,
    budgetedSpent,
    overallPercentSpent,
    timeElapsedPercent,
    daysUntilPayday,
    paydayDay,
    todayLabel,
    monthLabel,
    pacePhrase: phrase,
    typicalMonthly,
  });
}
