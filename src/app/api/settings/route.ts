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
  const updated = updateAppSettings(workspaceId, body);
  return NextResponse.json(updated);
}
