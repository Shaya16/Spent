import { NextResponse } from "next/server";
import {
  setCategoryParent,
  updateCategoryBudgetMode,
  updateCategoryDescription,
} from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MAX_DESCRIPTION_LENGTH = 500;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const typed = body as {
    budgetMode?: unknown;
    description?: unknown;
    parentId?: unknown;
  };

  let applied = false;

  if (typed.budgetMode !== undefined) {
    if (typed.budgetMode !== "budgeted" && typed.budgetMode !== "tracking") {
      return NextResponse.json(
        { error: "budgetMode must be 'budgeted' or 'tracking'" },
        { status: 400 }
      );
    }
    const ok = updateCategoryBudgetMode(workspaceId, categoryId, typed.budgetMode);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.description !== undefined) {
    if (typed.description !== null && typeof typed.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 }
      );
    }
    if (
      typeof typed.description === "string" &&
      typed.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: `description must be ${MAX_DESCRIPTION_LENGTH} chars or fewer` },
        { status: 400 }
      );
    }
    const ok = updateCategoryDescription(
      workspaceId,
      categoryId,
      typed.description as string | null
    );
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.parentId !== undefined) {
    if (typed.parentId !== null && typeof typed.parentId !== "number") {
      return NextResponse.json(
        { error: "parentId must be a number or null" },
        { status: 400 }
      );
    }
    const result = setCategoryParent(
      workspaceId,
      categoryId,
      typed.parentId as number | null
    );
    if (!result.ok) {
      const status =
        result.reason === "not-found" || result.reason === "target-not-found"
          ? 404
          : 400;
      return NextResponse.json(
        { error: result.reason },
        { status }
      );
    }
    applied = true;
  }

  if (!applied) {
    return NextResponse.json(
      { error: "no recognized fields in body" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
