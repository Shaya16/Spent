import { NextResponse } from "next/server";
import { listChatSessions } from "@/server/db/queries/chat-sessions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listChatSessions(workspaceId));
}
