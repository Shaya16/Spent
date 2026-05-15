import { NextResponse } from "next/server";
import { setBudgetModesBulk } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const ids = (body as { budgetedIds?: unknown })?.budgetedIds;
  if (
    !Array.isArray(ids) ||
    !ids.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0)
  ) {
    return NextResponse.json(
      { error: "budgetedIds must be an array of positive integers" },
      { status: 400 }
    );
  }

  setBudgetModesBulk(workspaceId, ids as number[]);
  return NextResponse.json({ success: true });
}
