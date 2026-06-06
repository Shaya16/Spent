import { NextResponse } from "next/server";
import { buildInsightPayload } from "@/server/insights/engine";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getNextRunAt } from "@/server/sync/scheduler";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const payload = buildInsightPayload(workspaceId, new Date());
  payload.nextScheduledSync = getNextRunAt();
  return NextResponse.json(payload);
}
