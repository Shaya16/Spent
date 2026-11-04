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
    for (const d of ["2026-11-10", "2026-12-10", "2027-01-10"]) expect(out).toContain(d);
  });
  it("/sync runs the injected sync and reports its summary", async () => {
    expect(await cmd.handleCommand("/sync", 42, cfg, deps())).toContain("synced");
  });
  it("unknown text gets the help list", async () => {
    expect(await cmd.handleCommand("hello", 42, cfg, deps())).toContain("/month");
  });
});
