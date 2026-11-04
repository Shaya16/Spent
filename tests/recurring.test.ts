import { describe, it, expect } from "vitest";
import { detectRecurring, isActive, type RecurringTxn } from "@/server/insights/recurring";

const t = (date: string, amount: number, o: Partial<RecurringTxn> = {}): RecurringTxn => ({
  merchant: "netflix",
  account: "1",
  currency: "ILS",
  amount,
  date,
  ...o,
});

describe("detectRecurring", () => {
  it("suggests a monthly series after 3 occurrences within tolerance", () => {
    const s = detectRecurring([t("2026-08-10", -50), t("2026-09-11", -51), t("2026-10-10", -50.5)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ merchant: "netflix", cadence: "monthly", occurrences: 3, status: "suggested" });
    expect(s[0].expectedAmount).toBeCloseTo(50.5);
    expect(s[0].priceChange).toBeUndefined();
  });
  it("offers a candidate at 2 occurrences", () => {
    const s = detectRecurring([t("2026-09-10", -50), t("2026-10-10", -50)]);
    expect(s[0].status).toBe("candidate");
  });
  it("returns nothing for a single charge", () => {
    expect(detectRecurring([t("2026-10-10", -50)])).toEqual([]);
  });
  it("records a price change instead of splitting the series", () => {
    const s = detectRecurring([t("2026-08-10", -50), t("2026-09-10", -50), t("2026-10-10", -56)]);
    expect(s).toHaveLength(1);
    expect(s[0].occurrences).toBe(3);
    expect(s[0].priceChange).toEqual({ from: 50, to: 56, date: "2026-10-10" });
    expect(s[0].expectedAmount).toBe(56);
  });
  it("ignores refunds and income", () => {
    const s = detectRecurring([
      t("2026-08-10", -50), t("2026-09-10", -50), t("2026-09-20", 50), t("2026-10-10", -50),
      t("2026-08-01", 9000, { merchant: "salary" }), t("2026-09-01", 9000, { merchant: "salary" }), t("2026-10-01", 9000, { merchant: "salary" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].occurrences).toBe(3);
  });
  it("keeps the same merchant on two cards as two series", () => {
    const s = detectRecurring([
      t("2026-08-10", -50), t("2026-09-10", -50), t("2026-10-10", -50),
      t("2026-08-12", -50, { account: "2" }), t("2026-09-12", -50, { account: "2" }), t("2026-10-12", -50, { account: "2" }),
    ]);
    expect(s.map((x) => x.account).sort()).toEqual(["1", "2"]);
  });
  it("never merges different currencies", () => {
    const s = detectRecurring([t("2026-09-10", -10, { currency: "USD" }), t("2026-10-10", -10, { currency: "ILS" })]);
    expect(s).toEqual([]);
  });
  it("does not treat a merchant with wildly varying amounts as recurring", () => {
    const g = (d: string, a: number) => t(d, a, { merchant: "shufersal" });
    expect(detectRecurring([g("2026-07-08", -80), g("2026-08-09", -310), g("2026-09-08", -45), g("2026-10-09", -190)])).toEqual([]);
  });
  it("detects weekly and yearly cadences", () => {
    const w = detectRecurring([t("2026-10-01", -20), t("2026-10-08", -20), t("2026-10-15", -20)]);
    expect(w[0].cadence).toBe("weekly");
    const y = detectRecurring([t("2024-10-10", -300), t("2025-10-11", -300), t("2026-10-10", -300)]);
    expect(y[0].cadence).toBe("yearly");
  });
  it("only counts the latest unbroken run after a gap", () => {
    const s = detectRecurring([t("2026-01-10", -50), t("2026-02-10", -50), t("2026-06-10", -50), t("2026-07-10", -50)]);
    expect(s[0].occurrences).toBe(2);
    expect(s[0].status).toBe("candidate");
  });

  it("keeps a series that had two price changes, ending the run at the older change", () => {
    const s = detectRecurring([t("2026-07-10", -50), t("2026-08-10", -56), t("2026-09-10", -63), t("2026-10-10", -63)]);
    expect(s).toHaveLength(1);
    expect(s[0].priceChange).toEqual({ from: 56, to: 63, date: "2026-09-10" });
    expect(s[0].occurrences).toBe(3);
  });
});

describe("isActive", () => {
  const base = { merchant: "x", account: "1", currency: "ILS", expectedAmount: 10, occurrences: 3, status: "suggested" as const };
  it("is true within 1.5 cycles of the last charge", () => {
    expect(isActive({ ...base, cadence: "monthly", lastDate: "2026-10-05" }, "2026-11-04")).toBe(true);
  });
  it("is false once a series has gone quiet", () => {
    expect(isActive({ ...base, cadence: "monthly", lastDate: "2026-06-05" }, "2026-11-04")).toBe(false);
    expect(isActive({ ...base, cadence: "weekly", lastDate: "2026-10-01" }, "2026-11-04")).toBe(false);
  });
});
