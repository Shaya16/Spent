import { NextResponse } from "next/server";
import { listBankCredentials } from "@/server/db/queries/bank-credentials";
import { getProviderStats } from "@/server/db/queries/sync-runs";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const creds = listBankCredentials(workspaceId);
  const items = creds.map((c) => {
    const stats = getProviderStats(workspaceId, c.provider);
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
