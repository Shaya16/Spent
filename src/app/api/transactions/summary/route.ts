import { NextResponse } from "next/server";
import { getTransactionsSummary } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const credentialIds = searchParams.getAll("credentialIds").flatMap((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  });

  return NextResponse.json(
    getTransactionsSummary(workspaceId, from, to, {
      credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
    }),
  );
}
