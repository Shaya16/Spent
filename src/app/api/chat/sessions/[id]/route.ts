import { NextResponse } from "next/server";
import {
  deleteChatSession,
  getChatMessages,
  getChatSession,
  updateChatSessionTitle,
} from "@/server/db/queries/chat-sessions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const session = getChatSession(workspaceId, id);
  const messages = getChatMessages(workspaceId, id);

  if (!session || messages == null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    session: { ...session, messageCount: messages.length },
    messages,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const title =
    typeof (body as { title?: unknown })?.title === "string"
      ? (body as { title: string }).title
      : "";
  if (!title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const session = updateChatSessionTitle(workspaceId, id, title, "manual");
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const messages = getChatMessages(workspaceId, id) ?? [];
  return NextResponse.json({ ...session, messageCount: messages.length });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const deleted = deleteChatSession(workspaceId, id);
  if (!deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
