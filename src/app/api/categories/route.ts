import { NextResponse } from "next/server";
import {
  createParentCategory,
  ensureCategory,
  getAllCategories,
} from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CategoryKind } from "@/lib/types";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("kind");
  const kind: CategoryKind | undefined =
    raw === "expense" || raw === "income" ? raw : undefined;
  const leavesOnly = searchParams.get("leavesOnly") === "1";
  return NextResponse.json(
    getAllCategories(workspaceId, kind, { leavesOnly })
  );
}

interface CreateBody {
  name?: unknown;
  kind?: unknown;
  isParent?: unknown;
  icon?: unknown;
  description?: unknown;
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  if (body.kind !== "expense" && body.kind !== "income") {
    return NextResponse.json(
      { error: "kind must be 'expense' or 'income'" },
      { status: 400 }
    );
  }
  const icon =
    typeof body.icon === "string" && body.icon.length > 0
      ? body.icon
      : undefined;
  const description =
    typeof body.description === "string" ? body.description : null;

  try {
    if (body.isParent === true) {
      const cat = createParentCategory(workspaceId, {
        name: body.name,
        kind: body.kind,
        icon,
        description,
      });
      return NextResponse.json(cat, { status: 201 });
    }
    const cat = ensureCategory(workspaceId, body.name, icon, body.kind);
    return NextResponse.json(cat, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "a category with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
