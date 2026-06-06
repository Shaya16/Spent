import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { getAllCategories } from "../db/queries/categories";
import { updateChatSessionTitle } from "../db/queries/chat-sessions";
import {
  getCategoryBreakdown,
  getCategorySpendInRange,
  getMonthlySummary,
  getTopMerchants,
  queryTransactions,
} from "../db/queries/transactions";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO date format YYYY-MM-DD");

export function buildChatTools(workspaceId: number, sessionId?: string) {
  return {
    setChatTitle: tool({
      description:
        "Set a short, descriptive title for the current chat session. Use once after the first user message, and keep it under 6 words.",
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(80)
          .describe("Short chat title without quotes or punctuation."),
      }),
      execute: async ({ title }) => {
        if (!sessionId) return { ok: false };
        const session = updateChatSessionTitle(workspaceId, sessionId, title, "auto");
        return { ok: session != null, title: session?.title ?? title };
      },
    }),

    listCategories: tool({
      description:
        "List all spending and income categories defined in the user's workspace. Use this before filtering transactions by category to look up the correct category id and name.",
      inputSchema: z.object({}),
      execute: async () => {
        const categories = getAllCategories(workspaceId);
        return categories.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          kind: c.kind,
        }));
      },
    }),

    queryTransactions: tool({
      description:
        "Search the user's transactions. All amounts are in ILS. Negative charged_amount = expense, positive = income. Use the date range to scope queries. Returns at most 50 rows.",
      inputSchema: z.object({
        from: dateString.optional().describe("Start date (inclusive). Omit for no lower bound."),
        to: dateString.optional().describe("End date (inclusive). Omit for no upper bound."),
        search: z
          .string()
          .optional()
          .describe("Substring match against description and memo. Case-insensitive."),
        categoryId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Filter by a single category id. Look up ids first with listCategories."),
        kind: z
          .enum(["expense", "income", "all"])
          .optional()
          .describe("Filter by transaction kind. Defaults to all."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max rows to return. Defaults to 25."),
      }),
      execute: async ({ from, to, search, categoryId, kind, limit }) => {
        const { transactions, total } = queryTransactions(workspaceId, {
          from,
          to,
          search,
          category: categoryId,
          kind: kind ?? "all",
          limit: limit ?? 25,
          sort: "date",
          order: "desc",
        });
        return {
          total,
          returned: transactions.length,
          transactions: transactions.map((t) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            memo: t.memo,
            amount: t.chargedAmount,
            currency: t.originalCurrency,
            category: t.categoryName,
            account: t.accountLabel,
          })),
        };
      },
    }),

    monthlySummary: tool({
      description:
        "Return total expenses per month for the last N months. Useful for 'how much did I spend last month' or trend questions.",
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).describe("How many recent months to include."),
      }),
      execute: async ({ months }) => {
        return { summary: getMonthlySummary(workspaceId, months) };
      },
    }),

    topMerchants: tool({
      description:
        "Return the top spending merchants in a date range. Useful for 'where am I spending the most'.",
      inputSchema: z.object({
        from: dateString,
        to: dateString,
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max merchants. Defaults to 10."),
      }),
      execute: async ({ from, to, limit }) => {
        return {
          merchants: getTopMerchants(workspaceId, from, to, limit ?? 10),
        };
      },
    }),

    categoryBreakdown: tool({
      description:
        "Return total spend per category in a date range. Useful for budgeting and category comparison questions.",
      inputSchema: z.object({
        from: dateString,
        to: dateString,
      }),
      execute: async ({ from, to }) => {
        return { breakdown: getCategoryBreakdown(workspaceId, from, to) };
      },
    }),

    categorySpend: tool({
      description:
        "Return spend per category id in a date range (numeric ids only). Lighter than categoryBreakdown when you already have ids.",
      inputSchema: z.object({
        from: dateString,
        to: dateString,
      }),
      execute: async ({ from, to }) => {
        return { spend: getCategorySpendInRange(workspaceId, from, to) };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof buildChatTools>;
