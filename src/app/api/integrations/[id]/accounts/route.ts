import { NextResponse } from "next/server";
import { getBankCredentialMeta } from "@/server/db/queries/bank-credentials";
import {
  listCredentialAccounts,
  setAccountExcluded,
} from "@/server/db/queries/excluded-accounts";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function parseCredentialId(id: string): number | null {
  const credentialId = Number(id);
  if (!Number.isFinite(credentialId) || credentialId <= 0) return null;
  return credentialId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!getBankCredentialMeta(workspaceId, credentialId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    accounts: listCredentialAccounts(workspaceId, credentialId),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!getBankCredentialMeta(workspaceId, credentialId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { accountNumber?: string; excluded?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    typeof body.accountNumber !== "string" ||
    body.accountNumber.length === 0 ||
    typeof body.excluded !== "boolean"
  ) {
    return NextResponse.json(
      { error: "accountNumber and excluded are required." },
      { status: 400 }
    );
  }

  setAccountExcluded(
    workspaceId,
    credentialId,
    body.accountNumber,
    body.excluded
  );
  return NextResponse.json({ success: true });
}
