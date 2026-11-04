import { describe, it, expect, vi, beforeEach } from "vitest";

const scrape = vi.fn();
const anyCompany = new Proxy({}, { get: (_t, key) => key });

vi.mock("israeli-bank-scrapers", () => ({ CompanyTypes: anyCompany, createScraper: () => ({ scrape }) }));
vi.mock("@sergienko4/israeli-bank-scrapers", () => ({ CompanyTypes: anyCompany, createScraper: () => ({ scrape }) }));
vi.mock("@/server/db/queries/settings", () => ({ getWorkspaceSetting: () => null }));

const { scrapeBank } = await import("@/server/scrapers/index");
const ok = { success: true, accounts: [{ accountNumber: "1", txns: [] }] };

describe("scrapeBank failure handling", () => {
  beforeEach(() => scrape.mockReset());

  it("retries once when the scraper reports a network error, then succeeds", async () => {
    scrape.mockResolvedValueOnce({ success: false, errorType: "NETWORK_ERROR", errorMessage: "socket hang up" });
    scrape.mockResolvedValueOnce(ok);
    const r = await scrapeBank(1, "isracard", {}, new Date("2026-08-01"));
    expect(r.success).toBe(true);
    expect(scrape).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("explains a bot-protection block and does not retry it", async () => {
    scrape.mockResolvedValue({ success: false, errorType: "WAF_BLOCKED", errorMessage: "403 cloudflare" });
    const r = await scrapeBank(1, "isracard", {}, new Date("2026-08-01"));
    expect(r.success).toBe(false);
    expect(r.errorMessage).toMatch(/bot protection/i);
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  it("does not retry a timeout, which can mean a second login or SMS", async () => {
    scrape.mockResolvedValue({ success: false, errorType: "TIMEOUT", errorMessage: "timed out" });
    await scrapeBank(1, "isracard", {}, new Date("2026-08-01"));
    expect(scrape).toHaveBeenCalledTimes(1);
  });
});
