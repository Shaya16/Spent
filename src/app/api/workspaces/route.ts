import { NextResponse } from "next/server";
import {
  createWorkspace,
  listWorkspaces,
} from "@/server/db/queries/workspaces";

export async function GET() {
  return NextResponse.json(listWorkspaces());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const name =
    typeof (body as { name?: unknown })?.name === "string"
      ? ((body as { name: string }).name)
      : "";

  if (!name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  try {
    const ws = createWorkspace(name);
    return NextResponse.json(ws, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create workspace" },
      { status: 400 }
    );
  }
}
