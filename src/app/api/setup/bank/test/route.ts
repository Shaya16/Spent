import { NextResponse } from "next/server";
import { getBankCredentials } from "@/server/db/queries/bank-credentials";
import { scrapeBank } from "@/server/scrapers";
import type { BankProvider } from "@/lib/types";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as { provider: string };

  const credentials = getBankCredentials(workspaceId, body.provider);
  if (!credentials) {
    return NextResponse.json(
      { success: false, message: "No credentials found for this provider" },
      { status: 400 }
    );
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await scrapeBank(
    workspaceId,
    body.provider as BankProvider,
    credentials,
    sevenDaysAgo
  );

  if (!result.success) {
    return NextResponse.json({
      success: false,
      message: result.errorMessage ?? "Connection test failed",
    });
  }

  return NextResponse.json({
    success: true,
    message: "Connection successful",
    accountsFound: result.accounts.length,
  });
}
