import { NextResponse } from "next/server";
import { setSetting } from "@/server/db/queries/settings";
import { encrypt } from "@/server/lib/encryption";

function isLocalhostUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    provider: "claude" | "ollama" | "none";
    apiKey?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
  };

  setSetting("ai_provider", body.provider);

  if (body.provider === "claude" && body.apiKey) {
    const { encrypted, iv, authTag } = encrypt(body.apiKey);
    setSetting("ai_api_key_encrypted", encrypted.toString("hex"));
    setSetting("ai_api_key_iv", iv.toString("hex"));
    setSetting("ai_api_key_auth_tag", authTag.toString("hex"));
  }

  if (body.provider === "ollama") {
    if (body.ollamaUrl) {
      if (!isLocalhostUrl(body.ollamaUrl)) {
        return NextResponse.json(
          { success: false, message: "ollamaUrl must point to localhost" },
          { status: 400 }
        );
      }
      setSetting("ai_ollama_url", body.ollamaUrl);
    }
    if (body.ollamaModel) setSetting("ai_ollama_model", body.ollamaModel);
  }

  return NextResponse.json({ success: true });
}
