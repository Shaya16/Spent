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

const common = { type: "normal" as const, originalCurrency: "ILS" };
// Fork pending rows: empty identifier, raw date, positive unsigned amount.
const pending = (account: string, description: string, amount: number) => ({
  ...common, accountNumber: account, description, status: "pending" as const, identifier: "",
  date: "2026-11-01", processedDate: "2026-11-01", originalAmount: amount, chargedAmount: amount,
});
const completed = (account: string, description: string, amount: number) => ({
  ...common, accountNumber: account, description, status: "completed" as const, identifier: "9911",
  date: "2026-10-31T22:00:00.000Z", processedDate: "2026-12-10T00:00:00.000Z", originalAmount: -amount, chargedAmount: -amount,
});
const rows = (account: string) =>
  db.prepare("SELECT description, status, category_id as categoryId FROM transactions WHERE workspace_id = ? AND account_number = ? ORDER BY id").all(ws, account);

describe("saveSyncTransactions", () => {
  it("removes a pending row once the scrape returns it as completed in a different shape", () => {
    q.saveSyncTransactions(ws, [pending("A", "Wolt", 120)], "isracard", cred, run);
    q.saveSyncTransactions(ws, [completed("A", "Wolt", 120)], "isracard", cred, run);
    expect(rows("A")).toEqual([{ description: "Wolt", status: "completed", categoryId: null }]);
  });

  it("keeps a still-pending row, and the category set on it, across syncs", () => {
    q.saveSyncTransactions(ws, [pending("B", "Super-Pharm", 80)], "isracard", cred, run);
    const cat = (db.prepare("SELECT id FROM categories WHERE workspace_id = ? LIMIT 1").get(ws) as { id: number }).id;
    db.prepare("UPDATE transactions SET category_id = ?, category_source = 'user' WHERE account_number = 'B'").run(cat);
    q.saveSyncTransactions(ws, [pending("B", "Super-Pharm", 80)], "isracard", cred, run);
    expect(rows("B")).toEqual([{ description: "Super-Pharm", status: "pending", categoryId: cat }]);
  });

  it("leaves pending rows of accounts this scrape did not return", () => {
    q.saveSyncTransactions(ws, [pending("C", "Aroma", 30)], "isracard", cred, run);
    q.saveSyncTransactions(ws, [completed("D", "Rami Levy", 200)], "isracard", cred, run);
    expect(rows("C")).toHaveLength(1);
  });

  it("never deletes completed rows", () => {
    q.saveSyncTransactions(ws, [completed("E", "IKEA", 500)], "isracard", cred, run);
    q.saveSyncTransactions(ws, [pending("E", "Fox", 90)], "isracard", cred, run);
    expect(rows("E").map((r) => (r as { status: string }).status)).toEqual(["completed", "pending"]);
  });
});
