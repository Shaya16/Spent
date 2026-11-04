import { describe, it, expect } from "vitest";
import { addDays, addMonths, daysBetween, israelDay, monthKey } from "@/server/lib/date-utils";

describe("date helpers", () => {
  it("addMonths clamps to the month length and rolls the year", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("addDays and daysBetween agree across month ends", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06");
    expect(daysBetween("2026-10-30", "2026-11-06")).toBe(7);
  });
  it("monthKey shifts by whole months", () => {
    expect(monthKey("2026-01-15", -1)).toBe("2025-12");
    expect(monthKey("2026-11-04")).toBe("2026-11");
  });
  it("israelDay maps UTC instants to the Israeli calendar day", () => {
    expect(israelDay("2026-09-30T21:00:00.000Z")).toBe("2026-10-01");
    expect(israelDay("2026-01-31T22:30:00.000Z")).toBe("2026-02-01");
    expect(israelDay("2026-10-01")).toBe("2026-10-01");
  });
  it("israelDay leaves an unparseable value's first 10 characters", () => {
    expect(israelDay("01/10/2026 x")).toBe("01/10/2026");
  });
});
