import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let insertTransactions: typeof import("@/server/db/queries/transactions").insertTransactions;
let createSyncRun: typeof import("@/server/db/queries/sync-runs").createSyncRun;
let getDb: typeof import("@/server/db/index").getDb;

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-test-"));
  ({ getDb } = await import("@/server/db/index"));
  ({ createSyncRun } = await import("@/server/db/queries/sync-runs"));
  ({ insertTransactions } = await import("@/server/db/queries/transactions"));
});

const base = {
  accountNumber: "1234",
  type: "normal" as const,
  date: "2026-10-01T00:00:00.000Z",
  processedDate: "2026-11-10T00:00:00.000Z",
  originalAmount: -120,
  originalCurrency: "ILS",
  chargedAmount: -120,
  description: "שופרסל",
};

describe("insertTransactions pending upgrade", () => {
  it("updates a pending row to completed instead of duplicating it", () => {
    const db = getDb();
    const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    const cred = db
      .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
      .run(ws).lastInsertRowid as number;
    const run = createSyncRun(ws, "isracard", cred, "2026-10-01");
    insertTransactions(ws, [{ ...base, status: "pending" }], "isracard", cred, run);
    insertTransactions(ws, [{ ...base, status: "completed" }], "isracard", cred, run);
    const rows = db.prepare("SELECT status FROM transactions WHERE workspace_id = ?").all(ws) as { status: string }[];
    expect(rows).toEqual([{ status: "completed" }]);
  });
});
