import { NextResponse } from "next/server";
import type { BankProvider } from "@/lib/types";
import {
  getBankCredentials,
  getRequiresManualTwoFactor,
} from "@/server/db/queries/bank-credentials";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { scrapeBank } from "@/server/scrapers";

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as {
    provider: string;
    credentialId?: number;
    credentials?: Record<string, string>;
  };

  const credentials =
    body.credentials ??
    (body.credentialId != null ? getBankCredentials(workspaceId, body.credentialId) : null);

  if (!credentials) {
    return NextResponse.json(
      { success: false, message: "No credentials found for this account" },
      { status: 400 },
    );
  }

  const manualTwoFactor =
    body.credentialId != null ? getRequiresManualTwoFactor(workspaceId, body.credentialId) : false;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await scrapeBank(
    workspaceId,
    body.provider as BankProvider,
    credentials,
    sevenDaysAgo,
    { manualTwoFactor },
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
