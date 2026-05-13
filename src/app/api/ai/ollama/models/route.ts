import { NextResponse } from "next/server";
import {
  ensureOllamaRunning,
  listOllamaModels,
} from "@/server/ai/ollama-manager";
import { getAppSettings } from "@/server/db/queries/settings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url =
    searchParams.get("url") ?? getAppSettings().ollamaUrl;

  const status = await ensureOllamaRunning(url);
  if (!status.ok) {
    return NextResponse.json(
      { models: [], error: status.error },
      { status: 503 }
    );
  }

  const models = await listOllamaModels(url);
  return NextResponse.json({ models });
}
