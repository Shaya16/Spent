import { describe, it, expect } from "vitest";
import { computeDedupHash } from "@/server/lib/dedup";

const base = {
  accountNumber: "1234",
  date: "2026-11-01",
  originalAmount: -50,
  originalCurrency: "ILS",
  description: "שופרסל",
};

describe("computeDedupHash", () => {
  it("is stable for equal inputs", () => {
    expect(computeDedupHash(base)).toBe(computeDedupHash({ ...base }));
  });
  it("changes when the amount changes", () => {
    expect(computeDedupHash(base)).not.toBe(computeDedupHash({ ...base, originalAmount: -51 }));
  });
});
