import { NextResponse } from "next/server";
import {
  addExcludedMerchant,
  deleteExcludedMerchantByKey,
  setTransactionExcluded,
} from "@/server/db/queries/excluded-merchants";
import { getTransactionContext } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    excluded?: unknown;
    alwaysForMerchant?: unknown;
  };

  if (typeof body.excluded !== "boolean") {
    return NextResponse.json({ error: "body.excluded must be a boolean" }, { status: 400 });
  }

  const ctx = getTransactionContext(workspaceId, numericId);
  if (!ctx) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  setTransactionExcluded(workspaceId, numericId, body.excluded);

  if (body.alwaysForMerchant === true) {
    if (body.excluded) {
      addExcludedMerchant(workspaceId, ctx.provider, ctx.description);
    } else {
      deleteExcludedMerchantByKey(workspaceId, ctx.provider, ctx.description);
    }
  }

  return NextResponse.json({ success: true });
}
