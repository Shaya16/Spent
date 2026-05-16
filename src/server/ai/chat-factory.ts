import "server-only";

import type { ChatProvider } from "./chat-types";
import { ClaudeChatProvider } from "./providers/claude-chat";
import { OpenAIChatProvider } from "./providers/openai-chat";
import { getSetting } from "../db/queries/settings";
import { decrypt } from "../lib/encryption";

/**
 * Mirrors `createAIProvider` from `./factory.ts` but for the conversational
 * chat surface. Ollama is intentionally NOT supported here because tool-use
 * reliability varies wildly across local models; the chat drawer just hides
 * itself in that case.
 */
export function createChatProvider(): ChatProvider | null {
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
    return new ClaudeChatProvider(apiKey);
  }

  if (provider === "openai") {
    const encryptedKey = getSetting("openai_api_key_encrypted");
    const iv = getSetting("openai_api_key_iv");
    const authTag = getSetting("openai_api_key_auth_tag");
    if (!encryptedKey || !iv || !authTag) return null;
    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });
    const model = getSetting("ai_openai_model") ?? "gpt-4o-mini";
    return new OpenAIChatProvider(apiKey, model);
  }

  return null;
}

/**
 * Lightweight check used by the API to return a friendly error instead of
 * decrypting the key and starting a stream that would just fail.
 */
export function isChatAvailable(): boolean {
  const provider = getSetting("ai_provider");
  if (provider === "claude") {
    return (
      !!getSetting("ai_api_key_encrypted") &&
      !!getSetting("ai_api_key_iv") &&
      !!getSetting("ai_api_key_auth_tag")
    );
  }
  if (provider === "openai") {
    return (
      !!getSetting("openai_api_key_encrypted") &&
      !!getSetting("openai_api_key_iv") &&
      !!getSetting("openai_api_key_auth_tag")
    );
  }
  return false;
}
