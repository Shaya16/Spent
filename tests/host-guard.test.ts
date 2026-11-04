import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isAllowedHost } from "@/lib/host-guard";
import { proxy as middleware } from "@/proxy";

describe("isAllowedHost", () => {
  it("allows loopback names on any port", () => {
    for (const h of ["127.0.0.1:41234", "localhost:3000", "127.0.0.1", "[::1]:3000", "spent.localhost:41234"]) {
      expect(isAllowedHost(h)).toBe(true);
    }
  });
  it("rejects other names, lookalikes and a missing host", () => {
    for (const h of ["evil.com", "evil.com:41234", "127.0.0.1.evil.com", "localhost.evil.com:3000", "192.168.1.5:3000", "", null]) {
      expect(isAllowedHost(h as string | null)).toBe(false);
    }
  });
});

const req = (host: string, method = "GET", path = "/api/insights") =>
  new NextRequest(`http://${host}${path}`, { method, headers: { host } });

describe("isAllowedHost with SPENT_ALLOWED_HOSTS", () => {
  it("accepts extra host names the user listed, on any port", () => {
    expect(isAllowedHost("homeserver:41234", ["homeserver"])).toBe(true);
    expect(isAllowedHost("HomeServer", ["homeserver"])).toBe(true);
    expect(isAllowedHost("evil.com", ["homeserver"])).toBe(false);
    expect(isAllowedHost("[fd00::5]:41234", ["fd00::5"])).toBe(true);
  });
});

describe("middleware host guard", () => {
  it("blocks a DNS-rebound GET to the API", () => {
    expect(middleware(req("attacker.com:41234")).status).toBe(403);
  });
  it("blocks a rebound page request too", () => {
    expect(middleware(req("attacker.com:41234", "GET", "/")).status).toBe(403);
  });
  it("lets a normal localhost GET through", () => {
    expect(middleware(req("127.0.0.1:41234")).headers.get("x-middleware-next")).toBe("1");
  });
  it("requires a same-origin referer for the Ollama model list, which fetches a URL", () => {
    expect(middleware(req("127.0.0.1:41234", "GET", "/api/ai/ollama/models?url=http://10.0.0.1")).status).toBe(403);
    const ok = new NextRequest("http://127.0.0.1:41234/api/ai/ollama/models", {
      headers: { host: "127.0.0.1:41234", referer: "http://127.0.0.1:41234/settings/ai" },
    });
    expect(middleware(ok).headers.get("x-middleware-next")).toBe("1");
  });
  it("still requires an origin for localhost writes", () => {
    expect(middleware(req("127.0.0.1:41234", "POST")).status).toBe(403);
  });
});
