import "server-only";

import { RECOMMENDED_GEMINI_MODELS } from "@/lib/types";
import { getSetting } from "../db/queries/settings";
import { decrypt } from "../lib/encryption";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { OllamaProvider } from "./providers/ollama";
import type { AIProvider } from "./types";

export function createAIProvider(): AIProvider | null {
  const provider = getSetting("ai_provider");

  if (provider === "claude") {
    const encryptedKey = getSetting("ai_api_key_encrypted");
    const iv = getSetting("ai_api_key_iv");
    const authTag = getSetting("ai_api_key_auth_tag");

    if (!encryptedKey || !iv || !authTag) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    return new ClaudeProvider(apiKey);
  }

  if (provider === "gemini") {
    const encryptedKey = getSetting("ai_gemini_key_encrypted");
    const iv = getSetting("ai_gemini_key_iv");
    const authTag = getSetting("ai_gemini_key_auth_tag");

    if (!encryptedKey || !iv || !authTag) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    const model = getSetting("ai_gemini_model") ?? RECOMMENDED_GEMINI_MODELS[0].name;
    return new GeminiProvider(apiKey, model);
  }

  if (provider === "ollama") {
    const url = getSetting("ai_ollama_url") ?? "http://localhost:11434";
    const model = getSetting("ai_ollama_model") ?? "llama3.1";
    return new OllamaProvider(url, model);
  }

  return null;
}
