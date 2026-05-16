import "server-only";

import {
  getCategoryBreakdown,
  getMonthlySummary,
  getPeriodCount,
  getPeriodTotal,
  getTopMerchants,
  getCategorySpendByDay,
  getTopMerchantsForCategory,
  queryTransactions,
  type TransactionKindFilter,
} from "../db/queries/transactions";
import {
  getAllCategories,
  getCategoryById,
} from "../db/queries/categories";
import {
  getAllBudgets,
  getAutoBudgetAverage,
} from "../db/queries/budgets";
import { getAppSettings } from "../db/queries/settings";
import { getCashFlow } from "../db/queries/home";
import type { ToolDescriptor } from "./chat-types";

/** Runtime context passed to every tool execution. */
export interface ToolContext {
  workspaceId: number;
  /** ISO date 'YYYY-MM-DD' for "today" in the workspace's locale. */
  today: string;
}

export interface ChatTool {
  descriptor: ToolDescriptor;
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown> | unknown;
}

// ---------------------------------------------------------------------------
// Helpers

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function asInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = asNumber(v);
  if (n == null) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function asISODate(v: unknown, fallback: string): string {
  const s = asString(v);
  return s && ISO_DATE.test(s) ? s : fallback;
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function defaultRange(today: string): { from: string; to: string } {
  return { from: startOfMonth(today), to: endOfMonth(today) };
}

function schema(
  props: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> {
  return {
    type: "object",
    properties: props,
    required,
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Tools

const getPeriodSummary: ChatTool = {
  descriptor: {
    name: "get_period_summary",
    description:
      "Return income, expenses, net cash flow and headline metrics for a date range. Defaults to the current month when from/to are omitted. Use this first to get a high-level read of a period.",
    inputSchema: schema({
      from: {
        type: "string",
        description: "Start date in YYYY-MM-DD (inclusive). Defaults to first day of current month.",
      },
      to: {
        type: "string",
        description: "End date in YYYY-MM-DD (inclusive). Defaults to last day of current month.",
      },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const def = defaultRange(ctx.today);
    const from = asISODate(i.from, def.from);
    const to = asISODate(i.to, def.to);
    const cash = getCashFlow(ctx.workspaceId, from, to);
    const expenseTotal = getPeriodTotal(ctx.workspaceId, from, to);
    const expenseCount = getPeriodCount(ctx.workspaceId, from, to);
    const topMerchants = getTopMerchants(ctx.workspaceId, from, to, 5);
    const breakdown = getCategoryBreakdown(ctx.workspaceId, from, to).slice(0, 8);
    return {
      range: { from, to },
      currency: "ILS",
      income: cash.income,
      expenses: cash.expenses,
      net: cash.net,
      expenseTransactionCount: expenseCount,
      expenseTotal,
      topMerchants,
      topCategories: breakdown.map((b) => ({
        categoryId: b.categoryId,
        name: b.name,
        amount: b.amount,
        transactionCount: b.count,
      })),
    };
  },
};

const getMonthlyTrend: ChatTool = {
  descriptor: {
    name: "get_monthly_trend",
    description:
      "Monthly expense totals for the last N completed months (and the current one). Use this to spot trends or compare months.",
    inputSchema: schema({
      months: {
        type: "integer",
        description: "How many months back to include (1-24, default 6).",
        minimum: 1,
        maximum: 24,
      },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const months = asInt(i.months, 1, 24, 6);
    const series = getMonthlySummary(ctx.workspaceId, months);
    return { months, currency: "ILS", series };
  },
};

const getCategoryBreakdownTool: ChatTool = {
  descriptor: {
    name: "get_category_breakdown",
    description:
      "Breakdown of expenses by category for a date range. Returns every category with non-zero spend, ordered by amount desc.",
    inputSchema: schema({
      from: { type: "string", description: "Start date YYYY-MM-DD." },
      to: { type: "string", description: "End date YYYY-MM-DD." },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const def = defaultRange(ctx.today);
    const from = asISODate(i.from, def.from);
    const to = asISODate(i.to, def.to);
    const rows = getCategoryBreakdown(ctx.workspaceId, from, to);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return {
      range: { from, to },
      currency: "ILS",
      total,
      categories: rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        amount: r.amount,
        transactionCount: r.count,
        percentOfTotal: total > 0 ? Number(((r.amount / total) * 100).toFixed(1)) : 0,
      })),
    };
  },
};

const getCategoryDetail: ChatTool = {
  descriptor: {
    name: "get_category_detail",
    description:
      "Drill into one category: daily spend, top merchants, total over the range. Use after get_category_breakdown to investigate a specific bucket.",
    inputSchema: schema(
      {
        categoryId: { type: "integer", description: "Category id from get_category_breakdown." },
        from: { type: "string", description: "Start date YYYY-MM-DD." },
        to: { type: "string", description: "End date YYYY-MM-DD." },
      },
      ["categoryId"]
    ),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const categoryId = asInt(i.categoryId, 1, Number.MAX_SAFE_INTEGER, -1);
    if (categoryId < 0) {
      return { error: "categoryId is required" };
    }
    const def = defaultRange(ctx.today);
    const from = asISODate(i.from, def.from);
    const to = asISODate(i.to, def.to);
    const category = getCategoryById(ctx.workspaceId, categoryId);
    if (!category) return { error: `Unknown category ${categoryId}` };
    const daily = getCategorySpendByDay(ctx.workspaceId, categoryId, from, to);
    const topMerchants = getTopMerchantsForCategory(
      ctx.workspaceId,
      categoryId,
      from,
      to,
      8
    );
    const total = daily.reduce((s, d) => s + d.amount, 0);
    return {
      range: { from, to },
      currency: "ILS",
      category: {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        kind: category.kind,
        budgetMode: category.budgetMode,
      },
      total,
      dailySpend: daily,
      topMerchants,
    };
  },
};

const listTransactionsTool: ChatTool = {
  descriptor: {
    name: "list_transactions",
    description:
      "List transactions with optional filters. Capped at 50 rows per call to keep responses small. Use search for merchant/keyword matching.",
    inputSchema: schema({
      from: { type: "string", description: "Start date YYYY-MM-DD." },
      to: { type: "string", description: "End date YYYY-MM-DD." },
      search: { type: "string", description: "Substring matched against description or memo." },
      categoryId: { type: "integer", description: "Restrict to one category id." },
      kind: {
        type: "string",
        enum: ["expense", "income", "all"],
        description: "Defaults to 'expense'.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Max rows to return (1-50, default 20).",
      },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const limit = asInt(i.limit, 1, 50, 20);
    const kindRaw = asString(i.kind);
    const kind: TransactionKindFilter =
      kindRaw === "expense" || kindRaw === "income" || kindRaw === "all"
        ? kindRaw
        : "expense";
    const categoryId = asNumber(i.categoryId);
    const result = queryTransactions(ctx.workspaceId, {
      from: asString(i.from),
      to: asString(i.to),
      search: asString(i.search),
      category: categoryId != null ? Math.round(categoryId) : undefined,
      kind,
      limit,
      offset: 0,
    });
    return {
      total: result.total,
      returned: result.transactions.length,
      currency: "ILS",
      transactions: result.transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        memo: t.memo,
        chargedAmount: t.chargedAmount,
        kind: t.kind,
        provider: t.provider,
        category: t.categoryName,
      })),
    };
  },
};

const getTopMerchantsTool: ChatTool = {
  descriptor: {
    name: "get_top_merchants",
    description:
      "Top merchants by total spend in a date range. Useful to find where the money actually goes.",
    inputSchema: schema({
      from: { type: "string", description: "Start date YYYY-MM-DD." },
      to: { type: "string", description: "End date YYYY-MM-DD." },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 25,
        description: "How many merchants to return (default 10).",
      },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const def = defaultRange(ctx.today);
    const from = asISODate(i.from, def.from);
    const to = asISODate(i.to, def.to);
    const limit = asInt(i.limit, 1, 25, 10);
    const merchants = getTopMerchants(ctx.workspaceId, from, to, limit);
    return { range: { from, to }, currency: "ILS", merchants };
  },
};

const getBudgetsTool: ChatTool = {
  descriptor: {
    name: "get_budgets",
    description:
      "Return budget settings: per-category monthly budgets, auto-budget averages (3-month rolling), and the workspace monthly target if set.",
    inputSchema: schema({}),
  },
  execute(_input, ctx) {
    const budgets = getAllBudgets(ctx.workspaceId);
    const categories = getAllCategories(ctx.workspaceId, "expense");
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const auto = getAutoBudgetAverage(ctx.workspaceId, 3);
    const settings = getAppSettings(ctx.workspaceId);
    return {
      currency: "ILS",
      monthlyTarget: settings.monthlyTarget,
      paydayDay: settings.paydayDay,
      budgets: budgets.map((b) => ({
        categoryId: b.categoryId,
        categoryName: nameById.get(b.categoryId) ?? null,
        monthlyAmount: b.monthlyAmount,
        isAuto: b.isAuto,
      })),
      autoSuggested: auto.map((r) => ({
        categoryId: r.categoryId,
        categoryName: nameById.get(r.categoryId) ?? null,
        threeMonthAverage: Math.round(r.amount),
      })),
    };
  },
};

const findRecurringCharges: ChatTool = {
  descriptor: {
    name: "find_recurring_charges",
    description:
      "Detect probable recurring charges (subscriptions, fixed bills) by grouping expense transactions by description and keeping those seen in at least minOccurrences distinct months within the lookback window. Returns the monthly cost estimate.",
    inputSchema: schema({
      months: {
        type: "integer",
        minimum: 2,
        maximum: 12,
        description: "How many months back to scan (default 4).",
      },
      minOccurrences: {
        type: "integer",
        minimum: 2,
        maximum: 12,
        description: "Min distinct months a description must appear in (default 3).",
      },
    }),
  },
  execute(input, ctx) {
    const i = (input as Record<string, unknown>) ?? {};
    const months = asInt(i.months, 2, 12, 4);
    const minOcc = asInt(i.minOccurrences, 2, 12, Math.min(3, months));

    const [y, m] = ctx.today.split("-").map(Number);
    const startDate = new Date(y, m - 1 - (months - 1), 1);
    const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;
    const to = ctx.today;

    const result = queryTransactions(ctx.workspaceId, {
      from,
      to,
      kind: "expense",
      limit: 200,
      offset: 0,
    });

    const buckets = new Map<
      string,
      { description: string; months: Set<string>; totals: number[]; count: number }
    >();
    for (const t of result.transactions) {
      const key = t.description.trim().toLowerCase();
      if (!key) continue;
      const bucket =
        buckets.get(key) ??
        { description: t.description, months: new Set<string>(), totals: [], count: 0 };
      bucket.months.add(t.date.slice(0, 7));
      bucket.totals.push(Math.abs(t.chargedAmount));
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    const recurring = [];
    for (const b of buckets.values()) {
      if (b.months.size < minOcc) continue;
      const avg =
        b.totals.reduce((s, n) => s + n, 0) / Math.max(1, b.totals.length);
      recurring.push({
        description: b.description,
        monthsSeen: b.months.size,
        chargesInWindow: b.count,
        averageCharge: Number(avg.toFixed(2)),
        estimatedMonthlyCost: Number((avg * (b.count / Math.max(1, b.months.size))).toFixed(2)),
      });
    }
    recurring.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost);

    return {
      range: { from, to },
      currency: "ILS",
      windowMonths: months,
      minOccurrences: minOcc,
      sampleSize: result.transactions.length,
      truncated: result.total > result.transactions.length,
      recurring: recurring.slice(0, 25),
    };
  },
};

export const CHAT_TOOLS: ChatTool[] = [
  getPeriodSummary,
  getMonthlyTrend,
  getCategoryBreakdownTool,
  getCategoryDetail,
  listTransactionsTool,
  getTopMerchantsTool,
  getBudgetsTool,
  findRecurringCharges,
];

export const CHAT_TOOL_DESCRIPTORS: ToolDescriptor[] = CHAT_TOOLS.map(
  (t) => t.descriptor
);

const TOOL_BY_NAME = new Map(CHAT_TOOLS.map((t) => [t.descriptor.name, t]));

export function findTool(name: string): ChatTool | undefined {
  return TOOL_BY_NAME.get(name);
}
