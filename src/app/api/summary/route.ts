import { NextResponse } from "next/server";
import {
  getMonthlySummary,
  getTopMerchants,
  getCategoryBreakdown,
  getPeriodTotal,
  getPeriodCount,
} from "@/server/db/queries/transactions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0, 8) + "01";
  const to =
    searchParams.get("to") ??
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
  const months = Number(searchParams.get("months") ?? "12");

  return NextResponse.json({
    periodTotal: getPeriodTotal(from, to),
    transactionCount: getPeriodCount(from, to),
    monthlySpend: getMonthlySummary(months),
    topMerchants: getTopMerchants(from, to),
    categoryBreakdown: getCategoryBreakdown(from, to),
  });
}
