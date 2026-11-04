const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The Ollama URL, reduced to its origin, or null unless it is http(s) on this computer. */
export function normalizeOllamaUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!LOOPBACK.has(url.hostname)) return null;
  return url.origin;
}
