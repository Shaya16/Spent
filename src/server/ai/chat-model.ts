import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ai-sdk-ollama";
import type { LanguageModel } from "ai";
import { getSetting } from "../db/queries/settings";
import { decrypt } from "../lib/encryption";

export const CLAUDE_CHAT_MODEL_ID = "claude-haiku-4-5-20251001";

export function createChatModel(): LanguageModel | null {
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

    return createAnthropic({ apiKey })(CLAUDE_CHAT_MODEL_ID);
  }

  if (provider === "ollama") {
    const url = getSetting("ai_ollama_url") ?? "http://localhost:11434";
    const model = getSetting("ai_ollama_model") ?? "llama3.2:3b";
    return createOllama({ baseURL: `${url.replace(/\/$/, "")}/api` })(model);
  }

  return null;
}
