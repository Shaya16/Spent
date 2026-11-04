import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeOllamaUrl } from "@/lib/url-guard";

describe("normalizeOllamaUrl", () => {
  it("accepts loopback hosts and returns only the origin", () => {
    expect(normalizeOllamaUrl("http://localhost:11434")).toBe("http://localhost:11434");
    expect(normalizeOllamaUrl("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
    expect(normalizeOllamaUrl("http://[::1]:11434")).toBe("http://[::1]:11434");
    expect(normalizeOllamaUrl("http://127.0.0.1:11434/x?y=1")).toBe("http://127.0.0.1:11434");
  });
  it("rejects remote hosts, lookalikes, credentials and other schemes", () => {
    for (const u of [
      "http://192.168.1.1", "http://10.0.0.5:11434", "http://localhost.evil.com", "http://127.0.0.1.evil.com",
      "http://user:pw@127.0.0.1:11434", "ftp://localhost", "file:///etc/passwd", "javascript:alert(1)", "not a url", "",
    ]) {
      expect(normalizeOllamaUrl(u)).toBeNull();
    }
  });
});

describe("ollama-manager with a remote URL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never sends a request to a non-loopback address", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const m = await import("@/server/ai/ollama-manager");
    expect(await m.listOllamaModels("http://192.168.1.1")).toEqual([]);
    const status = await m.ensureOllamaRunning("http://192.168.1.1?x=");
    expect(status.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
