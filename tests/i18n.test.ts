import { describe, it, expect } from "vitest";
import en from "../src/i18n/messages/en.json";
import he from "../src/i18n/messages/he.json";

function keys(o: unknown, prefix = ""): string[] {
  if (o === null || typeof o !== "object") return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n", () => {
  it("en and he have identical key sets", () => {
    const e = new Set(keys(en));
    const h = new Set(keys(he));
    expect([...e].filter((k) => !h.has(k))).toEqual([]);
    expect([...h].filter((k) => !e.has(k))).toEqual([]);
  });
  it("has keys for the insights and rules pages", () => {
    expect(keys(en)).toContain("insights.title");
    expect(keys(en)).toContain("rules.title");
    expect(keys(he)).toContain("nav.insights");
  });
});
