import { NextResponse } from "next/server";
import { updateTransactionCategory } from "@/server/db/queries/transactions";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as { categoryId: number };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  updateTransactionCategory(Number(id), body.categoryId, "user");

  return NextResponse.json({ success: true });
}
