import { NextResponse } from "next/server";
import {
  getBankCredentials,
  saveBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { BANK_PROVIDERS } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    provider: string;
    credentials: Record<string, string>;
  };

  if (!body.provider || !body.credentials) {
    return NextResponse.json(
      { success: false, message: "Missing provider or credentials" },
      { status: 400 }
    );
  }

  // If any password-type field is blank, keep the existing value.
  // Lets users update non-secret fields without retyping their password.
  const info = BANK_PROVIDERS.find((b) => b.id === body.provider);
  const passwordKeys =
    info?.credentialFields.filter((f) => f.type === "password").map((f) => f.key) ?? [];
  const existing = getBankCredentials(body.provider);

  const merged: Record<string, string> = { ...body.credentials };
  for (const key of passwordKeys) {
    if (!merged[key] || merged[key].trim() === "") {
      if (existing && existing[key]) {
        merged[key] = existing[key];
      }
    }
  }

  // Reject if we still don't have a value for required password fields
  for (const key of passwordKeys) {
    if (!merged[key]) {
      return NextResponse.json(
        { success: false, message: `Missing required field: ${key}` },
        { status: 400 }
      );
    }
  }

  saveBankCredentials(body.provider, merged);

  return NextResponse.json({ success: true });
}
