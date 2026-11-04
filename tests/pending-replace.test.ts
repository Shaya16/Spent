import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let q: typeof import("@/server/db/queries/transactions");
let ws: number, cred: number, run: number;

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-pend-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/transactions");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  cred = db
    .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
    .run(ws).lastInsertRowid as number;
  run = createSyncRun(ws, "isracard", cred, "2026-10-01");
});

const common = { accountNumber: "1234", type: "normal" as const, originalCurrency: "ILS", description: "שופרסל" };

describe("replacePendingForAccounts", () => {
  it("removes stale pending rows even when the completed row has a different shape", () => {
    // Fork pending rows: empty identifier, raw date, positive unsigned amount.
    q.insertTransactions(ws, [{ ...common, status: "pending", identifier: "", date: "2026-10-01", processedDate: "2026-10-01", originalAmount: 120, chargedAmount: 120 }], "isracard", cred, run);
    q.replacePendingForAccounts(ws, cred, ["1234"]);
    q.insertTransactions(ws, [{ ...common, status: "completed", identifier: "9911", date: "2026-10-01T00:00:00.000Z", processedDate: "2026-11-10T00:00:00.000Z", originalAmount: -120, chargedAmount: -120 }], "isracard", cred, run);
    const rows = db.prepare("SELECT status FROM transactions WHERE workspace_id = ?").all(ws);
    expect(rows).toEqual([{ status: "completed" }]);
  });
  it("leaves completed rows and other accounts alone", () => {
    q.insertTransactions(ws, [{ ...common, accountNumber: "5678", status: "pending", date: "2026-11-01", processedDate: "2026-11-01", originalAmount: 5, chargedAmount: 5 }], "isracard", cred, run);
    q.replacePendingForAccounts(ws, cred, ["1234"]);
    const n = (db.prepare("SELECT COUNT(*) as c FROM transactions WHERE workspace_id = ?").get(ws) as { c: number }).c;
    expect(n).toBe(2);
  });
});
