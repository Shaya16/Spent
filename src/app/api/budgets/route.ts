import { NextResponse } from "next/server";
import {
  getAllBudgets,
  setBudget,
  deleteBudget,
} from "@/server/db/queries/budgets";

export async function GET() {
  return NextResponse.json(getAllBudgets());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    categoryId: number;
    amount?: number | null;
  };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  if (body.amount == null) {
    deleteBudget(body.categoryId);
    return NextResponse.json({ success: true });
  }

  if (body.amount < 0) {
    return NextResponse.json(
      { error: "amount must be non-negative" },
      { status: 400 }
    );
  }

  setBudget(body.categoryId, body.amount, false);
  return NextResponse.json({ success: true });
}
