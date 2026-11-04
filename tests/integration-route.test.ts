import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let id: number;
let GET: typeof import("@/app/api/integrations/[id]/route").GET;

beforeAll(async () => {
  process.env.SPENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "spent-integ-"));
  const db = (await import("@/server/db/index")).getDb();
  const { saveBankCredentials } = await import("@/server/db/queries/bank-credentials");
  ({ GET } = await import("@/app/api/integrations/[id]/route"));
  const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  id = saveBankCredentials(ws, "isracard", { id: "123456789", card6Digits: "654321", password: "SuperSecret!" }, { label: "Isracard" }) as unknown as number;
});

describe("GET /api/integrations/[id]", () => {
  it("never returns the saved password, but keeps the non-secret fields", async () => {
    const res = await GET(new Request(`http://127.0.0.1/api/integrations/${id}`), { params: Promise.resolve({ id: String(id) }) });
    const text = await res.text();
    expect(text).not.toContain("SuperSecret!");
    const body = JSON.parse(text);
    expect(body.credentials.password).toBeUndefined();
    expect(body.credentials.card6Digits).toBe("654321");
  });
});
