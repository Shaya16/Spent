import { NextResponse } from "next/server";
import { deleteRule } from "@/server/db/queries/rules";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  deleteRule(getWorkspaceIdFromRequest(request), n);
  return new NextResponse(null, { status: 204 });
}
