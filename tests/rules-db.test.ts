import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

type Q = typeof import("@/server/db/queries/rules");
let q: Q;
let db: ReturnType<typeof import("@/server/db/index").getDb>;
let ws: number;
let run: number;

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-rules-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/rules");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = db
    .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
    .run(ws).lastInsertRowid as number;
  run = createSyncRun(ws, "isracard", cred, "2026-10-01");
  const base = { accountNumber: "1", type: "normal" as const, date: "2026-10-01T00:00:00.000Z", processedDate: "2026-11-10T00:00:00.000Z", originalCurrency: "ILS", status: "completed" as const };
  insertTransactions(ws, [
    { ...base, originalAmount: -50, chargedAmount: -50, description: "וולט תל אביב 55" },
    { ...base, originalAmount: -900, chargedAmount: -900, description: "העברה לחיסכון" },
  ], "isracard", cred, run);
});

describe("applyRulesToSyncRun", () => {
  it("sets category and kind from stored rules and reports the count", () => {
    const cat = (db.prepare("SELECT id FROM categories WHERE workspace_id = ? AND kind = 'expense' LIMIT 1").get(ws) as { id: number }).id;
    q.createRule(ws, { field: "merchant", op: "contains", value: "וולט", categoryId: cat });
    q.createRule(ws, { field: "merchant", op: "contains", value: "חיסכון", kind: "transfer" });
    expect(q.applyRulesToSyncRun(ws, run)).toBe(2);
    const rows = db.prepare("SELECT description, category_id, category_source, kind FROM transactions WHERE workspace_id = ? ORDER BY id").all(ws) as { description: string; category_id: number | null; category_source: string | null; kind: string }[];
    expect(rows[0]).toMatchObject({ category_id: cat, category_source: "user", kind: "expense" });
    expect(rows[1].kind).toBe("transfer");
  });
  it("rejects an unsafe regex rule at creation", () => {
    expect(() => q.createRule(ws, { field: "merchant", op: "regex", value: "(a+)+$" })).toThrow(/unsafe/i);
  });
});

describe("createRule validation", () => {
  it("rejects an operator that cannot apply to the field", () => {
    expect(() => q.createRule(ws, { field: "amount", op: "regex", value: "1", kind: "transfer" })).toThrow(/operator/i);
    expect(() => q.createRule(ws, { field: "merchant", op: "gt", value: "1", kind: "transfer" })).toThrow(/operator/i);
  });
  it("rejects a non-numeric amount", () => {
    expect(() => q.createRule(ws, { field: "amount", op: "gt", value: "abc", kind: "transfer" })).toThrow(/number/i);
  });
  it("rejects a category from another workspace", () => {
    const other = db.prepare("INSERT INTO workspaces (name, slug) VALUES ('Other', 'other')").run().lastInsertRowid as number;
    const foreign = db.prepare("INSERT INTO categories (workspace_id, name, color, icon, kind) VALUES (?, 'X', '#000', 'tag', 'expense')").run(other).lastInsertRowid as number;
    expect(() => q.createRule(ws, { field: "merchant", op: "contains", value: "x", categoryId: foreign })).toThrow(/category/i);
  });
});
