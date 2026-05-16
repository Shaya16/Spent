import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { BANK_PROVIDERS } from "@/lib/types";

// Returns credentials with password-type fields stripped out. The edit form
// leaves those inputs blank; the POST handler's blank=keep logic preserves
// the stored value when the user saves without retyping a password.
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

  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  const passwordKeys = new Set(
    info?.credentialFields.filter((f) => f.type === "password").map((f) => f.key) ?? []
  );
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    safe[k] = passwordKeys.has(k) ? "" : v;
  }

  return NextResponse.json({ credentials: safe });
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
