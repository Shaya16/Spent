import { NextResponse } from "next/server";
import {
  queryTransactions,
  getCategorySpendByDay,
  getTopMerchantsForCategory,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { getAllBudgets, getAutoBudgetSource } from "@/server/db/queries/budgets";
import { toLocalISODate } from "@/server/lib/date-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const category = getAllCategories().find((c) => c.id === categoryId);
  if (!category) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const dailySpend = getCategorySpendByDay(categoryId, from, to);
  const spent = dailySpend.reduce((sum, d) => sum + d.amount, 0);

  const explicitBudget = getAllBudgets().find(
    (b) => b.categoryId === categoryId
  );
  const autoSource = getAutoBudgetSource(-1).find(
    (s) => s.categoryId === categoryId
  );
  const budget = explicitBudget?.monthlyAmount ?? autoSource?.amount ?? 0;
  const isAutoBudget = !explicitBudget;

  const prevDaily = getCategorySpendByDay(categoryId, prevFrom, prevTo);
  const prevSpent = prevDaily.reduce((sum, d) => sum + d.amount, 0);
  const vsLastMonth =
    prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;

  const filterKind = category.kind === "income" ? "income" : "expense";

  const { transactions, total: transactionCount } = queryTransactions({
    from,
    to,
    category: categoryId,
    kind: filterKind,
    sort: "date",
    order: "desc",
    limit: 50,
  });

  const needsReviewTransactions = transactions.filter((t) => t.needsReview);

  const topMerchants = getTopMerchantsForCategory(categoryId, from, to, 6);
  const avgPerTransaction = transactionCount > 0 ? spent / transactionCount : 0;

  return NextResponse.json({
    category: {
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      kind: category.kind,
    },
    spent,
    budget,
    isAutoBudget,
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
  });
}
