import { NextResponse } from "next/server";
import { deleteBankCredentials } from "@/server/db/queries/bank-credentials";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  deleteBankCredentials(provider);
  return NextResponse.json({ success: true });
}
