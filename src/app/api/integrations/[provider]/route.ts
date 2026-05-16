import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
  getRequiresManualTwoFactor,
  setRequiresManualTwoFactor,
  updateCredentialField,
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
    return NextResponse.json({
      credentials: null,
      requiresManualTwoFactor: false,
      hasTwoFactorToken: false,
    });
  }

  // Strip the long-term OTP token from the response - the form has no use
  // for it and surfacing it would be a small information leak in the
  // network panel. The hasTwoFactorToken boolean is enough for the UI.
  const { otpLongTermToken, ...userFacing } = credentials;

  return NextResponse.json({
    credentials: userFacing,
    requiresManualTwoFactor: getRequiresManualTwoFactor(workspaceId, provider),
    hasTwoFactorToken: Boolean(otpLongTermToken),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { provider } = await params;

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
      provider,
      body.requiresManualTwoFactor
    );
  }
  if (body.resetTwoFactorToken === true) {
    updateCredentialField(workspaceId, provider, "otpLongTermToken", null);
  }

  return NextResponse.json({ success: true });
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
