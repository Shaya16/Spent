import { NextResponse } from "next/server";
import { BANK_PROVIDERS } from "@/lib/types";
import {
  defaultLabelForProvider,
  getBankCredentialMeta,
  getBankCredentials,
  saveBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as {
    provider: string;
    credentials: Record<string, string>;
    label?: string;
    credentialId?: number;
    requiresManualTwoFactor?: boolean;
  };

  if (!body.provider || !body.credentials) {
    return NextResponse.json(
      { success: false, message: "Missing provider or credentials" },
      { status: 400 },
    );
  }

  const info = BANK_PROVIDERS.find((b) => b.id === body.provider);
  const passwordKeys =
    info?.credentialFields.flatMap((f) => (f.type === "password" ? [f.key] : [])) ?? [];

  const credentialId = body.credentialId;
  const existing = credentialId != null ? getBankCredentials(workspaceId, credentialId) : null;

  if (credentialId != null && !getBankCredentialMeta(workspaceId, credentialId)) {
    return NextResponse.json({ success: false, message: "Credential not found" }, { status: 404 });
  }

  const merged: Record<string, string> = { ...body.credentials };
  for (const key of passwordKeys) {
    if (!merged[key] || merged[key].trim() === "") {
      if (existing?.[key]) {
        merged[key] = existing[key];
      }
    }
  }

  for (const key of passwordKeys) {
    if (!merged[key]) {
      return NextResponse.json(
        { success: false, message: `Missing required field: ${key}` },
        { status: 400 },
      );
    }
  }

  if (existing?.otpLongTermToken && !merged.otpLongTermToken) {
    merged.otpLongTermToken = existing.otpLongTermToken;
  }

  const label =
    body.label?.trim() ||
    (credentialId != null
      ? getBankCredentialMeta(workspaceId, credentialId)?.label
      : defaultLabelForProvider(workspaceId, body.provider)) ||
    defaultLabelForProvider(workspaceId, body.provider);

  try {
    const id = saveBankCredentials(workspaceId, body.provider, merged, {
      credentialId,
      label,
      requiresManualTwoFactor: body.requiresManualTwoFactor,
    });
    return NextResponse.json({ success: true, credentialId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save credentials";
    if (/UNIQUE constraint/i.test(message)) {
      return NextResponse.json(
        {
          success: false,
          message: "An account with this label already exists for this bank.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
