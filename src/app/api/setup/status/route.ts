import { NextResponse } from "next/server";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const hasBank = hasBankCredentials(workspaceId);
  const aiProvider = getGlobalSetting("ai_provider");
  const hasAI = aiProvider !== null && aiProvider !== "none";

  return NextResponse.json({
    isConfigured: hasBank,
    hasBankCredentials: hasBank,
    hasAIProvider: hasAI,
  });
}
