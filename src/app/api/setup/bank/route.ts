import { NextResponse } from "next/server";
import { saveBankCredentials } from "@/server/db/queries/bank-credentials";

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

  saveBankCredentials(body.provider, body.credentials);

  return NextResponse.json({ success: true });
}
