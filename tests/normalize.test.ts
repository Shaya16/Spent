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
  it("treats the Hebrew maqaf and a hyphen as the same character", () => {
    expect(normalizeMerchant("תל־אביב")).toBe(normalizeMerchant("תל-אביב"));
  });
  it("keeps the original key for a Latin name with a branch number, so learned categories still match", () => {
    expect(normalizeMerchant("SUPER-PHARM 123")).toBe("super-pharm");
  });
  it("keeps a number joined to the name", () => {
    expect(normalizeMerchant("7-11")).toBe("7-11");
  });
  it("still drops a bare branch number after a Hebrew name", () => {
    expect(normalizeMerchant("שופרסל 123")).toBe("שופרסל");
  });
  it("strips invisible direction marks", () => {
    expect(normalizeMerchant("‏שופרסל‎")).toBe("שופרסל");
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
