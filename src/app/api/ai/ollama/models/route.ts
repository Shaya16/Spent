import { NextResponse } from "next/server";
import {
  ensureOllamaRunning,
  listOllamaModels,
} from "@/server/ai/ollama-manager";
import { getGlobalSetting } from "@/server/db/queries/settings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url =
    searchParams.get("url") ??
    getGlobalSetting("ai_ollama_url") ??
    "http://localhost:11434";

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
