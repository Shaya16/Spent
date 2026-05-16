import { NextResponse } from "next/server";
import {
  createThread,
  listThreads,
} from "@/server/db/queries/chat";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ threads: listThreads(workspaceId) });
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  let body: { title?: string } = {};
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    body = {};
  }
  const thread = createThread(workspaceId, body.title);
  return NextResponse.json({ thread }, { status: 201 });
}
