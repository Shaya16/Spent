import { NextResponse } from "next/server";
import { getAllCategories } from "@/server/db/queries/categories";
import type { CategoryKind } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("kind");
  const kind: CategoryKind | undefined =
    raw === "expense" || raw === "income" ? raw : undefined;
  return NextResponse.json(getAllCategories(kind));
}
