import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

async function freshEncryption() {
  vi.resetModules();
  return import("@/server/lib/encryption");
}

describe("encryption key location", () => {
  let dataDir: string;
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "spent-cwd-"));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-data-"));
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    process.env.SPENT_DATA_DIR = dataDir;
  });

  it("keeps the key next to the database in SPENT_DATA_DIR", async () => {
    const { encrypt, decrypt } = await freshEncryption();
    const sealed = encrypt("secret");
    expect(fs.existsSync(path.join(dataDir, ".encryption-key"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, "data", ".encryption-key"))).toBe(false);
    expect(decrypt(sealed)).toBe("secret");
  });

  it("adopts a key left in ./data by an older version, so saved credentials still decrypt", async () => {
    const legacyKey = "ab".repeat(32);
    fs.mkdirSync(path.join(cwd, "data"));
    fs.writeFileSync(path.join(cwd, "data", ".encryption-key"), legacyKey, { mode: 0o600 });
    const { encrypt } = await freshEncryption();
    encrypt("x");
    expect(fs.readFileSync(path.join(dataDir, ".encryption-key"), "utf8").trim()).toBe(legacyKey);
  });
});
