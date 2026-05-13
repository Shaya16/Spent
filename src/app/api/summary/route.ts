import { NextResponse } from "next/server";
import {
  getMonthlySummary,
  getTopMerchants,
  getCategoryBreakdown,
  getPeriodTotal,
  getPeriodCount,
  getCategorySpendInRange,
  getTopMerchantPerCategory,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import {
  getAllBudgets,
  getAutoBudgetSource,
} from "@/server/db/queries/budgets";
import { getSetting } from "@/server/db/queries/settings";
import {
  computeStatus,
  daysInMonth,
  dayWithinMonth,
  daysUntil,
  nextPayday,
  pacePhrase,
} from "@/server/lib/pace";
import { toLocalISODate } from "@/server/lib/date-utils";

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export async function GET(request: Request) {
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

  const paydayDay = Number(getSetting("payday_day") ?? "1");
  const payday = nextPayday(today, paydayDay);
  const daysUntilPayday = Math.max(0, daysUntil(payday));

  // Compute previous month's range
  const prevMonthStart = new Date(year, month - 1, 1);
  const prevMonthEnd = new Date(year, month, 0);
  const prevFrom = toLocalISODate(prevMonthStart);
  const prevTo = toLocalISODate(prevMonthEnd);

  const categories = getAllCategories();
  const currentSpend = getCategorySpendInRange(from, to);
  const prevSpend = getCategorySpendInRange(prevFrom, prevTo);
  const topMerchants = getTopMerchantPerCategory(from, to);
  const explicitBudgets = getAllBudgets();
  const autoSource = getAutoBudgetSource(-1);

  const currentMap = new Map(currentSpend.map((s) => [s.categoryId, s]));
  const prevMap = new Map(prevSpend.map((s) => [s.categoryId, s.amount]));
  const topMerchantMap = new Map(
    topMerchants.map((m) => [m.categoryId, m])
  );
  const budgetMap = new Map(
    explicitBudgets.map((b) => [b.categoryId, b])
  );
  const autoMap = new Map(autoSource.map((s) => [s.categoryId, s.amount]));

  const categoriesWithData = categories.map((cat) => {
    const spend = currentMap.get(cat.id);
    const spent = spend?.amount ?? 0;
    const count = spend?.count ?? 0;
    const explicit = budgetMap.get(cat.id);
    const autoAmount = autoMap.get(cat.id) ?? 0;
    const budget = explicit?.monthlyAmount ?? autoAmount;
    const isAuto = !explicit;
    const prev = prevMap.get(cat.id) ?? null;
    const vsLastMonth =
      prev != null && prev > 0 ? ((spent - prev) / prev) * 100 : null;
    const topMerchant = topMerchantMap.get(cat.id)?.merchant ?? null;
    const remaining = Math.max(0, budget - spent);
    const perDayRemaining =
      daysUntilPayday > 0 && remaining > 0
        ? remaining / daysUntilPayday
        : null;
    const percentSpent = budget > 0 ? (spent / budget) * 100 : 0;
    const status = computeStatus(spent, budget, timeElapsedPercent);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      spent,
      transactionCount: count,
      topMerchant,
      budget,
      isAutoBudget: isAuto,
      vsLastMonth,
      remaining,
      perDayRemaining,
      percentSpent,
      status,
    };
  });

  const periodTotal = getPeriodTotal(from, to);
  const transactionCount = getPeriodCount(from, to);
  const totalBudget = categoriesWithData.reduce(
    (sum, c) => sum + (c.budget ?? 0),
    0
  );
  const overallPercentSpent =
    totalBudget > 0 ? (periodTotal / totalBudget) * 100 : 0;
  const phrase = pacePhrase(
    periodTotal,
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
    monthlySpend: getMonthlySummary(months),
    topMerchants: getTopMerchants(from, to),
    categoryBreakdown: getCategoryBreakdown(from, to),
    // New fields for the budgets dashboard:
    categoriesWithData,
    totalBudget,
    overallPercentSpent,
    timeElapsedPercent,
    daysUntilPayday,
    paydayDay,
    todayLabel,
    monthLabel,
    pacePhrase: phrase,
  });
}
