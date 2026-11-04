import { describe, it, expect } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { backupData } from "../scripts/backup-data.mjs";

function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-backup-"));
  const db = new Database(path.join(dir, "spent.db"));
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('kept');");
  db.close();
  fs.writeFileSync(path.join(dir, ".encryption-key"), "cd".repeat(32), { mode: 0o600 });
  return dir;
}

describe("backupData", () => {
  it("copies a consistent database and the encryption key into data/backups/<stamp>", async () => {
    const dir = makeDataDir();
    const target = await backupData(dir, "20261104-120000");
    expect(target).toBe(path.join(dir, "backups", "20261104-120000"));
    const copy = new Database(path.join(target!, "spent.db"), { readonly: true });
    expect(copy.prepare("SELECT v FROM t").get()).toEqual({ v: "kept" });
    copy.close();
    expect(fs.readFileSync(path.join(target!, ".encryption-key"), "utf8")).toBe("cd".repeat(32));
  });

  it("keeps only the newest five backups", async () => {
    const dir = makeDataDir();
    for (let i = 1; i <= 7; i++) await backupData(dir, `20261104-12000${i}`);
    expect(fs.readdirSync(path.join(dir, "backups")).sort()).toEqual(
      ["20261104-120003", "20261104-120004", "20261104-120005", "20261104-120006", "20261104-120007"]
    );
  });

  it("does nothing on a fresh install with no database yet", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-backup-empty-"));
    expect(await backupData(dir, "20261104-120000")).toBeNull();
  });
});
