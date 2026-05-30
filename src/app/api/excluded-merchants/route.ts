import { NextResponse } from "next/server";
import { listExcludedMerchants } from "@/server/db/queries/excluded-merchants";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ rules: listExcludedMerchants(workspaceId) });
}
