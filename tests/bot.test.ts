import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

type Cmd = typeof import("@/server/bot/commands");
let cmd: Cmd;
let ws: number;
const cfg = { chatId: 42, billingDay: 10 };
const deps = () => ({ workspaceId: ws, today: "2026-11-04", runSync: async () => "synced" });

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-bot-"));
  const db = (await import("@/server/db/index")).getDb();
  cmd = await import("@/server/bot/commands");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = db
    .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
    .run(ws).lastInsertRowid as number;
  const run = createSyncRun(ws, "isracard", cred, "2026-08-01");
  const b = { accountNumber: "1", type: "normal" as const, originalCurrency: "ILS", status: "completed" as const };
  const row = (date: string, amount: number, description: string, extra = {}) => ({
    ...b, date: `${date}T00:00:00.000Z`, processedDate: `${date}T00:00:00.000Z`, originalAmount: amount, chargedAmount: amount, description, ...extra,
  });
  insertTransactions(ws, [
    row("2026-08-05", -50, "Netflix"), row("2026-09-05", -50, "Netflix"), row("2026-10-05", -50, "Netflix"),
    row("2026-11-02", -300, "שופרסל"),
    row("2026-10-10", -100, "IKEA", { type: "installments" as const, installmentNumber: 1, installmentTotal: 4 }),
  ], "isracard", cred, run);
});

describe("handleCommand", () => {
  it("ignores messages from any other chat", async () => {
    expect(await cmd.handleCommand("/month", 999, cfg, deps())).toBeNull();
  });
  it("/month reports this month's spending total", async () => {
    const out = (await cmd.handleCommand("/month", 42, cfg, deps()))!;
    expect(out).toContain("300");
  });
  it("/subs lists the detected subscription", async () => {
    const out = (await cmd.handleCommand("/subs", 42, cfg, deps()))!;
    expect(out.toLowerCase()).toContain("netflix");
  });
  it("/forecast lists the next 3 billing dates", async () => {
    const out = (await cmd.handleCommand("/forecast", 42, cfg, deps()))!;
    // Seeded charges mostly bill on the 5th, so the card's billing day is derived as 5, not the configured 10.
    for (const d of ["2026-11-05", "2026-12-05", "2027-01-05"]) expect(out).toContain(d);
  });
  it("/sync runs the injected sync and reports its summary", async () => {
    expect(await cmd.handleCommand("/sync", 42, cfg, deps())).toContain("synced");
  });
  it("says setup is needed when there is no workspace", async () => {
    const out = await cmd.handleCommand("/month", 42, cfg, { ...deps(), workspaceId: undefined });
    expect(out).toMatch(/not set up/i);
  });
  it("/sync refuses to start a second sync while one is running", async () => {
    let called = false;
    const out = await cmd.handleCommand("/sync", 42, cfg, {
      ...deps(),
      isSyncRunning: () => true,
      runSync: async () => { called = true; return "synced"; },
    });
    expect(out).toMatch(/already running/i);
    expect(called).toBe(false);
  });
  it("unknown text gets the help list", async () => {
    expect(await cmd.handleCommand("hello", 42, cfg, deps())).toContain("/month");
  });
});
