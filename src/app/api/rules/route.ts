import { NextResponse } from "next/server";
import { createRule, listRules, type NewRule } from "@/server/db/queries/rules";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const FIELDS = ["merchant", "amount", "account"];
const OPS = ["contains", "equals", "regex", "gt", "lt"];
const KINDS = ["expense", "income", "transfer"];

export async function GET(request: Request) {
  return NextResponse.json(listRules(getWorkspaceIdFromRequest(request)));
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !FIELDS.includes(body.field as string) ||
    !OPS.includes(body.op as string) ||
    typeof body.value !== "string" ||
    body.value.trim() === "" ||
    body.value.length > 200 ||
    (body.categoryId != null && !Number.isInteger(body.categoryId)) ||
    (body.kind != null && !KINDS.includes(body.kind as string)) ||
    (body.categoryId == null && body.kind == null)
  ) {
    return NextResponse.json({ error: "Invalid rule" }, { status: 400 });
  }
  try {
    const id = createRule(workspaceId, {
      field: body.field,
      op: body.op,
      value: body.value.trim(),
      categoryId: (body.categoryId as number | undefined) ?? undefined,
      kind: (body.kind as NewRule["kind"]) ?? undefined,
    } as NewRule);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid rule" }, { status: 400 });
  }
}
