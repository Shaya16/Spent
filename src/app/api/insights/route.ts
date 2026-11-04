import { NextResponse } from "next/server";
import { loadInsights } from "@/server/insights/data";
import { forecastBill } from "@/server/insights/forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { toLocalISODate } from "@/server/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const today = toLocalISODate(new Date());
  const i = loadInsights(workspaceId, today);
  const forecast = forecastBill({
    billingDay: Number(process.env.CARD_BILLING_DAY) || 10,
    today,
    series: i.series,
    installments: i.installments,
    avgDiscretionary: i.avgDiscretionary,
    posted: i.posted,
  });
  return NextResponse.json({ series: i.series, forecast, anomalies: i.anomalies });
}
