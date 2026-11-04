import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { providerLogoSrc } from "@/lib/provider-logos";
import { LOCAL_PROVIDER_LOGOS } from "@/lib/provider-logos.generated";
import { BANK_PROVIDERS } from "@/lib/types";

describe("providerLogoSrc", () => {
  it("serves a bundled logo from the app itself", () => {
    expect(providerLogoSrc("max.co.il")).toBe("/banks/max.co.il.png");
  });
  it("returns null when there is no bundled logo, so the badge shows initials", () => {
    expect(providerLogoSrc("unionbank.co.il")).toBeNull();
    expect(providerLogoSrc(undefined)).toBeNull();
  });
  it("never points outside the app", () => {
    for (const p of BANK_PROVIDERS) {
      const src = providerLogoSrc(p.domain);
      if (src) expect(src.startsWith("/banks/")).toBe(true);
    }
  });
  it("has a file in public/banks for every listed logo", () => {
    for (const domain of LOCAL_PROVIDER_LOGOS) {
      expect(fs.existsSync(path.join("public", "banks", `${domain}.png`))).toBe(true);
    }
  });
  it("covers Isracard and Max", () => {
    expect(LOCAL_PROVIDER_LOGOS.has("isracard.co.il")).toBe(true);
    expect(LOCAL_PROVIDER_LOGOS.has("max.co.il")).toBe(true);
  });
});
