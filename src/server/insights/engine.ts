import "server-only";

import type {
  InsightPayload,
  InsightSection,
  InsightSectionError,
  Mover,
  Verdict,
} from "@/lib/types";
import { getAutoBudgetAverage } from "../db/queries/budgets";
import { getAllCategories } from "../db/queries/categories";
import {
  getBankHealth,
  getCashFlow,
  getHistoricalTrend,
  getNeedsAttentionCounts,
  getRecentTransactionsForHome,
} from "../db/queries/home";
import { getWorkspaceSetting } from "../db/queries/settings";
import {
  getCategoryMonthlySpend,
  getCategorySpendInRange,
  getDailySpendTotals,
  getPeriodTotal,
  getTopMerchantPerCategory,
} from "../db/queries/transactions";
import { daysUntil, nextPayday } from "../lib/pace";
import {
  buildInsights,
  type CategoryMeta,
  computeBreakdown,
  computeMonthRanges,
  computeMovers,
  computeVerdict,
  cumulative,
  rollUpByParent,
} from "./compute";

const HISTORICAL_MONTHS = 8;
const RECENT_TXN_LIMIT = 6;
const TREND_MONTHS = 6;

function safe<T>(section: InsightSection, errors: InsightSectionError[], fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    errors.push({ section, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Largest current-month merchant per rolled-up category, for the mover "why". */
function topMerchantByKey(
  workspaceId: number,
  from: string,
  to: string,
  metaById: Map<number, CategoryMeta>,
): Map<number, string> {
  const rows = getTopMerchantPerCategory(workspaceId, from, to);
  const best = new Map<number, number>();
  const result = new Map<number, string>();
  for (const row of rows) {
    const cat = metaById.get(row.categoryId);
    if (!cat) continue;
    const key = cat.parentId ?? cat.id;
    if (row.amount > (best.get(key) ?? -1)) {
      best.set(key, row.amount);
      result.set(key, row.merchant);
    }
  }
  return result;
}

/** Trailing monthly totals per rolled-up category, for mover sparklines. */
function trendByKey(
  workspaceId: number,
  metaById: Map<number, CategoryMeta>,
): Map<number, number[]> {
  const rows = getCategoryMonthlySpend(workspaceId, TREND_MONTHS);
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const monthIndex = new Map(months.map((m, i) => [m, i] as const));
  const trend = new Map<number, number[]>();
  for (const r of rows) {
    const cat = metaById.get(r.categoryId);
    if (!cat) continue;
    const key = cat.parentId ?? cat.id;
    let arr = trend.get(key);
    if (!arr) {
      arr = new Array(months.length).fill(0);
      trend.set(key, arr);
    }
    const idx = monthIndex.get(r.month);
    if (idx != null) arr[idx] += r.amount;
  }
  return trend;
}

/**
 * The single source of truth behind the Home screen. Gathers spend once, rolls
 * leaves to parents once, and derives every insight deterministically so two
 * sections can never disagree about the same number.
 */
export function buildInsightPayload(workspaceId: number, now: Date): InsightPayload {
  const errors: InsightSectionError[] = [];
  const ranges = computeMonthRanges(now);

  const metaById = new Map<number, CategoryMeta>();
  for (const c of getAllCategories(workspaceId, "expense")) {
    metaById.set(c.id, {
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      color: c.color,
      icon: c.icon,
    });
  }

  const currentRolled = rollUpByParent(
    getCategorySpendInRange(workspaceId, ranges.current.from, ranges.current.to),
    metaById,
  );
  // Movers and breakdown deltas compare against the SAME elapsed window last
  // month (day-aligned), never the full prior month, so a partial month is not
  // judged against a complete one. The full prior month is only used for the
  // burndown baseline curve below.
  const priorRolled = rollUpByParent(
    getCategorySpendInRange(workspaceId, ranges.priorMtd.from, ranges.priorMtd.to),
    metaById,
  );
  const typicalByKey = rollUpByParent(getAutoBudgetAverage(workspaceId, 3), metaById);
  let typicalTotal = 0;
  for (const v of typicalByKey.values()) typicalTotal += v;
  const typicalMonthly = typicalTotal > 0 ? typicalTotal : null;

  const verdict = safe<Verdict>("verdict", errors, () => {
    const spentMtd = getPeriodTotal(workspaceId, ranges.current.from, ranges.current.to);
    const priorMtd = getPeriodTotal(workspaceId, ranges.priorMtd.from, ranges.priorMtd.to);
    const paydayDay = Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1");
    const daysUntilPayday = Math.max(0, daysUntil(nextPayday(now, paydayDay), now));
    const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
    const parsedTarget = targetRaw != null ? Number(targetRaw) : Number.NaN;
    const monthlyTarget = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null;
    return computeVerdict({
      spentMtd,
      priorMtd,
      elapsedDays: ranges.elapsedDays,
      totalDays: ranges.totalDays,
      daysUntilPayday,
      monthLabel: ranges.monthLabel,
      typicalMonthly,
      monthlyTarget,
    });
  });

  const movers = safe<Mover[]>("movers", errors, () =>
    computeMovers({
      current: currentRolled,
      prior: priorRolled,
      metaById,
      topMerchantByKey: topMerchantByKey(
        workspaceId,
        ranges.current.from,
        ranges.current.to,
        metaById,
      ),
      trendByKey: trendByKey(workspaceId, metaById),
    }),
  );

  const breakdown = safe("breakdown", errors, () =>
    computeBreakdown(currentRolled, priorRolled, metaById),
  );

  const insights = safe("insights", errors, () =>
    verdict
      ? buildInsights({
          verdict,
          movers: movers ?? [],
          current: currentRolled,
          typicalByKey,
          metaById,
        })
      : [],
  );

  const burndown = safe("burndown", errors, () => {
    const cur = getDailySpendTotals(workspaceId, ranges.current.from, ranges.current.to).map(
      (d) => d.amount,
    );
    const pri = getDailySpendTotals(workspaceId, ranges.priorFull.from, ranges.priorFull.to).map(
      (d) => d.amount,
    );
    return {
      current: cumulative(cur).slice(0, ranges.elapsedDays),
      prior: cumulative(pri),
      totalDays: ranges.totalDays,
    };
  });

  const cashFlow = safe("cashFlow", errors, () =>
    getCashFlow(workspaceId, ranges.current.from, ranges.current.to),
  );
  const trend = safe("trend", errors, () => getHistoricalTrend(workspaceId, HISTORICAL_MONTHS));
  const recentTransactions = safe("recentTransactions", errors, () =>
    getRecentTransactionsForHome(workspaceId, RECENT_TXN_LIMIT),
  );
  const needsAttention = safe("needsAttention", errors, () => getNeedsAttentionCounts(workspaceId));
  const bankHealth = safe("bankHealth", errors, () => getBankHealth(workspaceId));

  return {
    verdict,
    cashFlow,
    movers,
    breakdown,
    insights,
    trend,
    burndown,
    recentTransactions,
    needsAttention,
    bankHealth,
    nextScheduledSync: null,
    errors,
  };
}
