import { NextResponse } from "next/server";
import {
  getAppSettings,
  updateAppSettings,
} from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getAppSettings(workspaceId));
}

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = await request.json();
  try {
    const updated = updateAppSettings(workspaceId, body);
    if (body.autoSyncEnabled !== undefined || body.autoSyncTime !== undefined) {
      const { reschedule } = await import("@/server/sync/scheduler");
      reschedule();
    }
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
