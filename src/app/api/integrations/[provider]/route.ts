import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

// Returns the full decrypted credential set for one provider, including
// password fields. Spent is a local-only app - this stays on 127.0.0.1
// and lets the Edit form pre-fill every field so users only retype what
// they actually want to change.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { provider } = await params;
  const credentials = getBankCredentials(workspaceId, provider);
  if (!credentials) {
    return NextResponse.json({ credentials: null });
  }
  return NextResponse.json({ credentials });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { provider } = await params;
  deleteBankCredentials(workspaceId, provider);
  return NextResponse.json({ success: true });
}
