import { NextResponse } from "next/server";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { getSetting } from "@/server/db/queries/settings";

export async function GET() {
  const hasBank = hasBankCredentials();
  const aiProvider = getSetting("ai_provider");
  const hasAI = aiProvider !== null && aiProvider !== "none";

  return NextResponse.json({
    isConfigured: hasBank,
    hasBankCredentials: hasBank,
    hasAIProvider: hasAI,
  });
}
