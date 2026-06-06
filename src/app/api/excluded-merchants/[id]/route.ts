import { NextResponse } from "next/server";
import { deleteExcludedMerchant } from "@/server/db/queries/excluded-merchants";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const removed = deleteExcludedMerchant(workspaceId, numericId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
