import { NextResponse } from "next/server";
import {
  deleteBankCredentials,
  getBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { BANK_PROVIDERS } from "@/lib/types";

// Returns decrypted credentials for one provider, with password-type fields
// stripped so they never round-trip through the network. Used to pre-fill
// the Edit form on the settings page.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const credentials = getBankCredentials(provider);
  if (!credentials) {
    return NextResponse.json({ credentials: null });
  }

  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  const passwordKeys = new Set(
    info?.credentialFields.filter((f) => f.type === "password").map((f) => f.key) ?? []
  );

  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (passwordKeys.has(k)) continue;
    safe[k] = v;
  }

  return NextResponse.json({ credentials: safe });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  deleteBankCredentials(provider);
  return NextResponse.json({ success: true });
}
