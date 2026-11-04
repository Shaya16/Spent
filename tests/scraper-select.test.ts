import { describe, it, expect } from "vitest";
import { usesScraperFork } from "@/server/scrapers/select";

describe("usesScraperFork", () => {
  it("is off by default so existing users keep the library their stored rows came from", () => {
    expect(usesScraperFork("isracard", {})).toBe(false);
    expect(usesScraperFork("max", {})).toBe(false);
  });
  it("routes only Isracard and Max to the fork when SPENT_SCRAPER_FORK=1", () => {
    const env = { SPENT_SCRAPER_FORK: "1" };
    expect(usesScraperFork("isracard", env)).toBe(true);
    expect(usesScraperFork("max", env)).toBe(true);
    expect(usesScraperFork("leumi", env)).toBe(false);
  });
});
