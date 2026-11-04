import { describe, it, expect } from "vitest";
import { normalizeMerchant, translateMerchant } from "@/server/rules/normalize";

describe("normalizeMerchant", () => {
  it("collapses branch numbers and star suffixes to one key", () => {
    expect(normalizeMerchant("שופרסל דיל סניף 123*")).toBe(normalizeMerchant("שופרסל  דיל"));
  });
  it("strips nikud", () => {
    expect(normalizeMerchant("שׁוֹפְרְסָל")).toBe("שופרסל");
  });
  it("strips trailing dash, star and digits", () => {
    expect(normalizeMerchant("AMZN Mktp - 4421")).toBe("amzn mktp");
    expect(normalizeMerchant("wolt*")).toBe("wolt");
  });
  it("lowercases Latin and keeps mixed Hebrew/English", () => {
    expect(normalizeMerchant("  Super-Pharm תל אביב ")).toBe("super-pharm תל אביב");
  });
  it("returns empty string for empty or noise-only input", () => {
    expect(normalizeMerchant("")).toBe("");
    expect(normalizeMerchant(" *- 123 ")).toBe("");
  });
});

describe("translateMerchant", () => {
  const table = { "שופרסל": "Shufersal" };
  it("returns the translation for a known key", () => {
    expect(translateMerchant("שופרסל", table)).toBe("Shufersal");
  });
  it("returns null for an unknown key", () => {
    expect(translateMerchant("אחר", table)).toBeNull();
  });
});
