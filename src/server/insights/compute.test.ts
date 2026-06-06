import { describe, expect, test } from "bun:test";

import {
  buildInsights,
  type CategoryMeta,
  computeBreakdown,
  computeMonthRanges,
  computeMovers,
  computeVerdict,
  cumulative,
  rollUpByParent,
} from "./compute";

function meta(rows: Array<[number, number | null, string]>): Map<number, CategoryMeta> {
  const m = new Map<number, CategoryMeta>();
  for (const [id, parentId, name] of rows) {
    m.set(id, { id, parentId, name, color: "#000", icon: null });
  }
  return m;
}

describe("computeMonthRanges", () => {
  test("day-aligns the prior-month window to month-to-date", () => {
    // 10 March 2026: 10 days elapsed of a 31-day month.
    const r = computeMonthRanges(new Date(2026, 2, 10));
    expect(r.current).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(r.priorFull).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(r.priorMtd).toEqual({ from: "2026-02-01", to: "2026-02-10" });
    expect(r.elapsedDays).toBe(10);
    expect(r.totalDays).toBe(31);
  });

  test("clamps the prior MTD day to the shorter prior month", () => {
    // 31 March: February only has 28 days, so prior MTD ends 28 Feb.
    const r = computeMonthRanges(new Date(2026, 2, 31));
    expect(r.elapsedDays).toBe(31);
    expect(r.priorMtd.to).toBe("2026-02-28");
  });
});

describe("computeVerdict", () => {
  test("projects month-end linearly and judges pace vs typical", () => {
    const v = computeVerdict({
      spentMtd: 1000,
      priorMtd: 800,
      elapsedDays: 10,
      totalDays: 30,
      daysUntilPayday: 5,
      monthLabel: "March",
      typicalMonthly: 2000,
      monthlyTarget: null,
    });
    expect(v.projected).toBe(3000);
    expect(v.deltaAmount).toBe(200);
    expect(v.deltaPercent).toBeCloseTo(25);
    expect(v.vsTypicalPercent).toBeCloseTo(50);
    expect(v.projectedStatus).toBe("over");
  });

  test("reports 'under' when projected to land below typical", () => {
    const v = computeVerdict({
      spentMtd: 300,
      priorMtd: 600,
      elapsedDays: 10,
      totalDays: 30,
      daysUntilPayday: 5,
      monthLabel: "March",
      typicalMonthly: 2000,
      monthlyTarget: 2500,
    });
    expect(v.projected).toBe(900);
    expect(v.projectedStatus).toBe("under");
    expect(v.remaining).toBe(2200);
    expect(v.deltaPercent).toBeCloseTo(-50);
  });

  test("leaves pace on-track and percentages null without a baseline", () => {
    const v = computeVerdict({
      spentMtd: 500,
      priorMtd: 0,
      elapsedDays: 5,
      totalDays: 30,
      daysUntilPayday: 1,
      monthLabel: "March",
      typicalMonthly: null,
      monthlyTarget: null,
    });
    expect(v.deltaPercent).toBeNull();
    expect(v.vsTypicalPercent).toBeNull();
    expect(v.projectedStatus).toBe("on-track");
  });
});

describe("rollUpByParent", () => {
  test("rolls leaves into their parent and keeps orphans under themselves", () => {
    const m = meta([
      [1, null, "Food"],
      [2, 1, "Groceries"],
      [3, 1, "Restaurants"],
      [4, null, "Rent"],
    ]);
    const rolled = rollUpByParent(
      [
        { categoryId: 2, amount: 300 },
        { categoryId: 3, amount: 200 },
        { categoryId: 4, amount: 4000 },
      ],
      m,
    );
    expect(rolled.get(1)).toBe(500);
    expect(rolled.get(4)).toBe(4000);
  });
});

describe("computeMovers", () => {
  const m = meta([
    [1, null, "Dining"],
    [2, null, "Groceries"],
    [3, null, "Rent"],
    [4, null, "Coffee"],
  ]);

  test("ranks by magnitude of change and suppresses small wiggles", () => {
    const movers = computeMovers({
      current: new Map([
        [1, 920], // +420 vs 500
        [2, 320], // -180 vs 500
        [3, 4010], // +10 vs 4000 -> below both floors
        [4, 60], // new, below the 150 floor
      ]),
      prior: new Map([
        [1, 500],
        [2, 500],
        [3, 4000],
      ]),
      metaById: m,
      topMerchantByKey: new Map([[1, "Cafe Cafe"]]),
      trendByKey: new Map([[1, [400, 500, 920]]]),
    });
    expect(movers.map((x) => x.categoryId)).toEqual([1, 2]);
    expect(movers[0]).toMatchObject({
      direction: "up",
      deltaAmount: 420,
      topMerchant: "Cafe Cafe",
    });
    expect(movers[1]).toMatchObject({ direction: "down", deltaAmount: -180 });
  });

  test("treats a large brand-new category as a mover", () => {
    const movers = computeMovers({
      current: new Map([[1, 600]]),
      prior: new Map(),
      metaById: m,
      topMerchantByKey: new Map(),
      trendByKey: new Map(),
    });
    expect(movers).toHaveLength(1);
    expect(movers[0]).toMatchObject({ deltaAmount: 600, deltaPercent: null });
  });
});

describe("computeBreakdown", () => {
  test("computes share of total and month-over-month delta, sorted", () => {
    const m = meta([
      [1, null, "Food"],
      [2, null, "Transport"],
    ]);
    const items = computeBreakdown(
      new Map([
        [1, 750],
        [2, 250],
      ]),
      new Map([[1, 500]]),
      m,
    );
    expect(items.map((i) => i.categoryId)).toEqual([1, 2]);
    expect(items[0].percentOfTotal).toBeCloseTo(75);
    expect(items[0].deltaPercent).toBeCloseTo(50);
    expect(items[1].deltaPercent).toBeNull();
  });
});

describe("buildInsights", () => {
  test("surfaces the biggest increase, a saving, and pace verdict", () => {
    const m = meta([
      [1, null, "Dining"],
      [2, null, "Groceries"],
    ]);
    const verdict = computeVerdict({
      spentMtd: 1000,
      priorMtd: 800,
      elapsedDays: 10,
      totalDays: 30,
      daysUntilPayday: 5,
      monthLabel: "March",
      typicalMonthly: 2000,
      monthlyTarget: null,
    });
    const movers: Parameters<typeof buildInsights>[0]["movers"] = [
      {
        categoryId: 1,
        name: "Dining",
        color: "#000",
        icon: null,
        current: 920,
        prior: 500,
        deltaAmount: 420,
        deltaPercent: 84,
        direction: "up",
        topMerchant: "Cafe Cafe",
        trend: [],
      },
      {
        categoryId: 2,
        name: "Groceries",
        color: "#000",
        icon: null,
        current: 320,
        prior: 500,
        deltaAmount: -180,
        deltaPercent: -36,
        direction: "down",
        topMerchant: null,
        trend: [],
      },
    ];
    const insights = buildInsights({
      verdict,
      movers,
      current: new Map([
        [1, 920],
        [2, 320],
      ]),
      typicalByKey: new Map(),
      metaById: m,
    });
    const types = insights.map((i) => i.type);
    expect(types).toContain("biggest-increase");
    expect(types).toContain("biggest-saving");
    expect(types).toContain("over-pace");
  });

  test("flags a category running well above its own typical", () => {
    const m = meta([[5, null, "Shopping"]]);
    const verdict = computeVerdict({
      spentMtd: 100,
      priorMtd: 100,
      elapsedDays: 10,
      totalDays: 30,
      daysUntilPayday: 5,
      monthLabel: "March",
      typicalMonthly: null,
      monthlyTarget: null,
    });
    const insights = buildInsights({
      verdict,
      movers: [],
      current: new Map([[5, 900]]),
      typicalByKey: new Map([[5, 300]]),
      metaById: m,
    });
    expect(insights.some((i) => i.type === "anomaly" && i.categoryId === 5)).toBe(true);
  });
});

describe("cumulative", () => {
  test("produces a running total", () => {
    expect(cumulative([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
    expect(cumulative([])).toEqual([]);
  });
});
