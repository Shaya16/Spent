import { NextResponse } from "next/server";
import {
  deleteThread,
  getThread,
  renameThread,
} from "@/server/db/queries/chat";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const thread = getThread(workspaceId, threadId);
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ thread });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: { title?: unknown };
  try {
    body = (await request.json()) as { title?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof body.title !== "string") {
    return NextResponse.json(
      { error: "title must be a string" },
      { status: 400 }
    );
  }
  const thread = renameThread(workspaceId, threadId, body.title);
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ thread });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const ok = deleteThread(workspaceId, threadId);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
