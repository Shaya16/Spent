import { NextResponse } from "next/server";
import { loadInsights } from "@/server/insights/data";
import { forecastCards } from "@/server/insights/forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const today = israelToday();
  const i = loadInsights(workspaceId, today, Number(process.env.CARD_BILLING_DAY) || 10);
  const forecast = forecastCards({ today, cards: i.cards, series: i.series, installments: i.installments });
  return NextResponse.json({ series: i.series, forecast, anomalies: i.anomalies });
}
