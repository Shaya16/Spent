import { NextResponse } from "next/server";
import {
  updateTransactionCategory,
  setTransactionKind,
  setTransactionNeedsReview,
  getTransactionContext,
} from "@/server/db/queries/transactions";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { getAllCategories } from "@/server/db/queries/categories";

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

  const numericId = Number(id);
  updateTransactionCategory(numericId, body.categoryId, "user");
  setTransactionNeedsReview(numericId, false);

  const ctx = getTransactionContext(numericId);
  if (ctx && (ctx.kind === "expense" || ctx.kind === "income")) {
    const category = getAllCategories().find((c) => c.id === body.categoryId);
    if (category && (category.kind === "expense" || category.kind === "income")) {
      recordMerchantCategory(
        ctx.description,
        body.categoryId,
        category.kind,
        "user"
      );
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    approve?: unknown;
  };

  const numericId = Number(id);

  if (body.approve === true) {
    const ctx = getTransactionContext(numericId);
    if (!ctx) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    setTransactionNeedsReview(numericId, false);
    if (
      ctx.categoryId != null &&
      (ctx.kind === "expense" || ctx.kind === "income")
    ) {
      const category = getAllCategories().find((c) => c.id === ctx.categoryId);
      if (
        category &&
        (category.kind === "expense" || category.kind === "income")
      ) {
        recordMerchantCategory(
          ctx.description,
          ctx.categoryId,
          category.kind,
          "approved-ai"
        );
      }
    }
    return NextResponse.json({ success: true });
  }

  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "kind must be 'expense', 'income', or 'transfer', or set approve:true" },
      { status: 400 }
    );
  }

  setTransactionKind(numericId, body.kind);

  return NextResponse.json({ success: true });
}
