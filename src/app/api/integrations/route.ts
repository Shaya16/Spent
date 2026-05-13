import { NextResponse } from "next/server";
import { listBankCredentials } from "@/server/db/queries/bank-credentials";
import { getProviderStats } from "@/server/db/queries/sync-runs";

export async function GET() {
  const creds = listBankCredentials();
  const items = creds.map((c) => {
    const stats = getProviderStats(c.provider);
    return {
      provider: c.provider,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastSyncAt: stats.lastSyncAt,
      transactionCount: stats.transactionCount,
    };
  });
  return NextResponse.json(items);
}
