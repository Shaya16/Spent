const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const OLLAMA_URL_ERROR =
  "The Ollama address must point to this computer (localhost). To use Ollama on another machine, set SPENT_ALLOW_REMOTE_OLLAMA=1.";

/**
 * The Ollama URL reduced to its origin, or null. Only loopback is accepted unless remote Ollama is explicitly
 * allowed: otherwise anyone able to change this setting could send transaction descriptions to their own server.
 */
export function normalizeOllamaUrl(
  value: string,
  allowRemote = process.env.SPENT_ALLOW_REMOTE_OLLAMA === "1"
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!allowRemote && !LOOPBACK.has(url.hostname)) return null;
  return url.origin;
}
