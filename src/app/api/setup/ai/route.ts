import { NextResponse } from "next/server";
import { setSetting } from "@/server/db/queries/settings";
import { encrypt } from "@/server/lib/encryption";
import { normalizeOllamaUrl } from "@/lib/url-guard";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    provider: "claude" | "ollama" | "none";
    apiKey?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
  };

  if (body.provider === "ollama" && body.ollamaUrl && !normalizeOllamaUrl(body.ollamaUrl)) {
    return NextResponse.json({ error: "The Ollama address must point to this computer (localhost)." }, { status: 400 });
  }

  setSetting("ai_provider", body.provider);
  if (body.provider === "claude" && body.apiKey) {
    const { encrypted, iv, authTag } = encrypt(body.apiKey);
    setSetting("ai_api_key_encrypted", encrypted.toString("hex"));
    setSetting("ai_api_key_iv", iv.toString("hex"));
    setSetting("ai_api_key_auth_tag", authTag.toString("hex"));
  }

  if (body.provider === "ollama") {
    if (body.ollamaUrl) setSetting("ai_ollama_url", normalizeOllamaUrl(body.ollamaUrl)!);
    if (body.ollamaModel) setSetting("ai_ollama_model", body.ollamaModel);
  }

  return NextResponse.json({ success: true });
}
