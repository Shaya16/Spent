import { describe, it, expect } from "vitest";
import { forecastBill, forecastCards } from "@/server/insights/forecast";
import { findAnomalies } from "@/server/insights/anomalies";
import type { Series } from "@/server/insights/recurring";

const sub = (o: Partial<Series> = {}): Series => ({
  merchant: "netflix", account: "1", currency: "ILS", cadence: "monthly", expectedAmount: 50,
  occurrences: 4, status: "suggested", lastDate: "2026-10-05", ...o,
});

describe("forecastBill", () => {
  it("returns the next 3 billing dates with total equal to the sum of its parts", () => {
    const out = forecastBill({
      billingDay: 10, today: "2026-11-04",
      series: [sub()],
      installments: [{ merchant: "ikea", account: "1", date: "2026-11-10", month: "2026-11", amount: 100 }],
      avgDiscretionary: 1000,
    });
    expect(out.map((f) => f.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(out[0].parts).toEqual({ posted: 0, recurring: 50, installments: 100, discretionary: 1000 });
    for (const f of out) expect(f.total).toBe(f.parts.posted + f.parts.recurring + f.parts.installments + f.parts.discretionary);
  });
  it("starts at the next month once the billing day has passed", () => {
    const out = forecastBill({ billingDay: 10, today: "2026-11-15", series: [], installments: [], avgDiscretionary: 0 });
    expect(out[0].date).toBe("2026-12-10");
  });
  it("includes today when today is the billing day", () => {
    const out = forecastBill({ billingDay: 10, today: "2026-11-10", series: [], installments: [], avgDiscretionary: 0 });
    expect(out[0].date).toBe("2026-11-10");
  });
  it("clamps billing day 31 to the last day of shorter months", () => {
    const out = forecastBill({ billingDay: 31, today: "2026-11-04", series: [], installments: [], avgDiscretionary: 0 });
    expect(out.map((f) => f.date)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });
  it("with no history yields only recurring and installments (discretionary 0)", () => {
    const out = forecastBill({ billingDay: 10, today: "2026-11-04", series: [sub()], installments: [], avgDiscretionary: 0 });
    expect(out[0].total).toBe(50);
  });
  it("ignores unconfirmed candidates and counts weekly series several times per cycle", () => {
    const cand = forecastBill({ billingDay: 10, today: "2026-11-04", series: [sub({ status: "candidate" })], installments: [], avgDiscretionary: 0 });
    expect(cand[0].parts.recurring).toBe(0);
    const weekly = forecastBill({ billingDay: 10, today: "2026-11-04", series: [sub({ cadence: "weekly", expectedAmount: 20, lastDate: "2026-10-30" })], installments: [], avgDiscretionary: 0 });
    expect(weekly[1].parts.recurring).toBeGreaterThanOrEqual(60);
  });
});

describe("forecastBill with posted charges", () => {
  it("adds charges already posted to the bill and scales the remaining discretionary spend", () => {
    const out = forecastBill({
      billingDay: 10, today: "2026-11-04", series: [], installments: [],
      avgDiscretionary: 620, posted: { "2026-11-10": 300 },
    });
    expect(out[0].parts.posted).toBe(300);
    expect(out[0].parts.discretionary).toBeGreaterThan(0);
    expect(out[0].parts.discretionary).toBeLessThan(620);
    expect(out[1].parts.discretionary).toBe(620);
    expect(out[0].total).toBeCloseTo(300 + out[0].parts.discretionary);
  });
  it("does not forecast a subscription that stopped charging", () => {
    const out = forecastBill({
      billingDay: 10, today: "2026-11-04", series: [sub({ lastDate: "2024-01-10" })], installments: [], avgDiscretionary: 0,
    });
    expect(out.every((f) => f.parts.recurring === 0)).toBe(true);
  });
});

describe("forecastCards", () => {
  it("forecasts each card on its own billing day and counts what was posted to it", () => {
    const out = forecastCards({
      today: "2026-11-01",
      cards: [
        { account: "A", billingDay: 2, posted: { "2026-11-02": 300 }, avgDiscretionary: 0 },
        { account: "B", billingDay: 10, posted: {}, avgDiscretionary: 0 },
      ],
      series: [sub({ account: "B", lastDate: "2026-10-05" })],
      installments: [{ merchant: "ikea", account: "A", date: "2026-12-02", month: "2026-12", amount: 100 }],
    });
    const a = out.filter((f) => f.account === "A");
    const b = out.filter((f) => f.account === "B");
    expect(a.map((f) => f.date)).toEqual(["2026-11-02", "2026-12-02", "2027-01-02"]);
    expect(a[0].parts.posted).toBe(300);
    expect(a[1].parts.installments).toBe(100);
    expect(a.every((f) => f.parts.recurring === 0)).toBe(true);
    expect(b[0].date).toBe("2026-11-10");
    expect(b[0].parts.recurring).toBe(50);
    expect(out.map((f) => f.date)).toEqual([...out.map((f) => f.date)].sort());
  });
});

const x = (date: string, amount: number, o: Record<string, unknown> = {}) => ({ merchant: "m", category: "Food", amount, date, ...o });

describe("findAnomalies", () => {
  it("flags a category spending far above its trailing 3-month mean", () => {
    const hist = [x("2026-08-05", -400), x("2026-09-05", -400), x("2026-10-05", -400)];
    const out = findAnomalies([...hist, x("2026-11-02", -900)], "2026-11-04");
    expect(out.filter((a) => a.type === "category_spike")).toHaveLength(1);
  });
  it("does not flag normal spending", () => {
    const hist = [x("2026-08-05", -400), x("2026-09-05", -400), x("2026-10-05", -400)];
    expect(findAnomalies([...hist, x("2026-11-02", -450)], "2026-11-04")).toEqual([]);
  });
  it("flags a large charge from a merchant never seen before", () => {
    const out = findAnomalies([x("2026-11-03", -2500, { merchant: "newshop", category: "Other" })], "2026-11-04");
    expect(out.filter((a) => a.type === "new_large_merchant")).toHaveLength(1);
  });
  it("flags a same-day duplicate charge once", () => {
    const out = findAnomalies([
      x("2026-10-01", -30), x("2026-11-03", -75), x("2026-11-03", -75),
    ], "2026-11-04");
    expect(out.filter((a) => a.type === "duplicate_charge")).toHaveLength(1);
  });
});
