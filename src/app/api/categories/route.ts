import { NextResponse } from "next/server";
import { getAllCategories } from "@/server/db/queries/categories";

export async function GET() {
  return NextResponse.json(getAllCategories());
}
