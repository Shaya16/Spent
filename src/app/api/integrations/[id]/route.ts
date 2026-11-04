import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
  getBankCredentialMeta,
  getRequiresManualTwoFactor,
  setRequiresManualTwoFactor,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { BANK_PROVIDERS } from "@/lib/types";

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

  const meta = getBankCredentialMeta(workspaceId, credentialId);
  if (!meta) {
    return NextResponse.json({
      credentials: null,
      label: null,
      provider: null,
      requiresManualTwoFactor: false,
      hasTwoFactorToken: false,
    });
  }

  const credentials = getBankCredentials(workspaceId, credentialId);
  if (!credentials) {
    return NextResponse.json({
      credentials: null,
      label: meta.label,
      provider: meta.provider,
      requiresManualTwoFactor: false,
      hasTwoFactorToken: false,
    });
  }

  // Secrets never go back to the browser; editing a saved bank means retyping its password.
  const secretKeys = new Set(
    (BANK_PROVIDERS.find((p) => p.id === meta.provider)?.credentialFields ?? [])
      .filter((f) => f.type === "password")
      .map((f) => f.key)
  );
  const userFacing = Object.fromEntries(
    Object.entries(credentials).filter(
      ([key]) => !secretKeys.has(key) && !/password|token|secret|pin/i.test(key)
    )
  );
  const hasToken = Boolean(credentials.otpLongTermToken);

  return NextResponse.json({
    credentials: userFacing,
    label: meta.label,
    provider: meta.provider,
    requiresManualTwoFactor: getRequiresManualTwoFactor(
      workspaceId,
      credentialId
    ),
    hasTwoFactorToken: hasToken,
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

  let body: {
    requiresManualTwoFactor?: boolean;
    resetTwoFactorToken?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (typeof body.requiresManualTwoFactor === "boolean") {
    setRequiresManualTwoFactor(
      workspaceId,
      credentialId,
      body.requiresManualTwoFactor
    );
  }
  if (body.resetTwoFactorToken === true) {
    updateCredentialField(
      workspaceId,
      credentialId,
      "otpLongTermToken",
      null
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  deleteBankCredentials(workspaceId, credentialId);
  return NextResponse.json({ success: true });
}
