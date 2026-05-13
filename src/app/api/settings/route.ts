import { NextResponse } from "next/server";
import {
  getAppSettings,
  updateAppSettings,
} from "@/server/db/queries/settings";

export async function GET() {
  return NextResponse.json(getAppSettings());
}

export async function PUT(request: Request) {
  const body = await request.json();
  const updated = updateAppSettings(body);
  return NextResponse.json(updated);
}
