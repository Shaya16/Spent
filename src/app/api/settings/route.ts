import { NextResponse } from "next/server";
import {
  getAppSettings,
  updateAppSettings,
} from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function isLocalhostUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getAppSettings(workspaceId));
}

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = await request.json();
  if (body.ollamaUrl !== undefined && !isLocalhostUrl(body.ollamaUrl)) {
    return NextResponse.json(
      { error: "ollamaUrl must point to localhost" },
      { status: 400 }
    );
  }
  const updated = updateAppSettings(workspaceId, body);
  return NextResponse.json(updated);
}
