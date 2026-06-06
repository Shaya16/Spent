import { NextResponse } from "next/server";
import type { EventStatus } from "@/lib/types";
import { confirmEvent, listEvents, rejectEvent } from "@/server/db/queries/financial-events";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const VALID_STATUSES: EventStatus[] = ["suggested", "confirmed", "rejected"];

function isStatus(v: string): v is EventStatus {
  return (VALID_STATUSES as string[]).includes(v);
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  const statuses = searchParams.getAll("status").filter(isStatus);

  const events = listEvents(workspaceId, {
    statuses: statuses.length > 0 ? statuses : undefined,
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
    offset: searchParams.has("offset") ? Number(searchParams.get("offset")) : undefined,
  });

  return NextResponse.json({ events });
}

export async function PATCH(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    action?: unknown;
  };

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.action === "confirm") {
    const ok = confirmEvent(workspaceId, id);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (body.action === "reject") {
    const ok = rejectEvent(workspaceId, id);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ error: "action must be 'confirm' or 'reject'" }, { status: 400 });
}
