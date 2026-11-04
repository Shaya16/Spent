import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let ws: number;
let loadInsights: typeof import("@/server/insights/data").loadInsights;

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-ins-"));
  const db = (await import("@/server/db/index")).getDb();
  ({ loadInsights } = await import("@/server/insights/data"));
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = db
    .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
    .run(ws).lastInsertRowid as number;
  const run = createSyncRun(ws, "isracard", cred, "2026-08-01");
  const b = { accountNumber: "1", originalCurrency: "ILS", status: "completed" as const, originalAmount: -100, chargedAmount: -100, description: "IKEA" };
  // A 12-payment installment plan billed monthly: must not look like a subscription.
  insertTransactions(ws, [
    { ...b, type: "installments" as const, date: "2026-08-10T00:00:00.000Z", processedDate: "2026-09-10T00:00:00.000Z", installmentNumber: 1, installmentTotal: 12 },
    { ...b, type: "installments" as const, date: "2026-09-10T00:00:00.000Z", processedDate: "2026-10-10T00:00:00.000Z", installmentNumber: 2, installmentTotal: 12 },
    { ...b, type: "installments" as const, date: "2026-10-10T00:00:00.000Z", processedDate: "2026-11-10T00:00:00.000Z", installmentNumber: 3, installmentTotal: 12 },
  ], "isracard", cred, run);
});

describe("loadInsights", () => {
  it("does not report installment payments as a recurring subscription", () => {
    expect(loadInsights(ws, "2026-11-04").series).toEqual([]);
  });
  it("reports charges already posted to an upcoming bill date", () => {
    expect(loadInsights(ws, "2026-11-04").posted["2026-11-10"]).toBe(100);
  });
  it("projects the remaining installments", () => {
    expect(loadInsights(ws, "2026-11-04").installments.length).toBe(9);
  });
});
