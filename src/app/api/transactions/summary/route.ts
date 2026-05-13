import { NextResponse } from "next/server";
import { getTransactionsSummary } from "@/server/db/queries/transactions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to are required" },
      { status: 400 }
    );
  }

  return NextResponse.json(getTransactionsSummary(from, to));
}
