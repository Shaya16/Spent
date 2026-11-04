import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isAllowedHost } from "@/lib/host-guard";
import { middleware } from "@/middleware";

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
  it("still requires an origin for localhost writes", () => {
    expect(middleware(req("127.0.0.1:41234", "POST")).status).toBe(403);
  });
});
