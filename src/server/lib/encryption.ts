import "server-only";

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// Key lives outside the data directory so that a copy of data/ alone is
// insufficient to decrypt credentials. Legacy location was data/.encryption-key;
// we migrate it transparently on first load.
const KEY_PATH = path.join(os.homedir(), ".config", "spent", ".encryption-key");
const LEGACY_KEY_PATH = path.join(process.cwd(), "data", ".encryption-key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function assertKeyFileMode(filePath: string, stat: fs.Stats): void {
  // POSIX-only. Windows NTFS ACLs don't map to mode bits meaningfully,
  // so skip there and rely on the default user profile permissions.
  if (process.platform === "win32") return;

  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `Refusing to read encryption key: ${filePath} has mode ${mode.toString(8).padStart(3, "0")}, expected 600. ` +
        `Fix with: chmod 600 ${filePath}`,
    );
  }
}

function getOrCreateKey(): Buffer {
  // Migrate from the legacy location (data/.encryption-key) if needed.
  if (!fs.existsSync(KEY_PATH) && fs.existsSync(LEGACY_KEY_PATH)) {
    const dir = path.dirname(KEY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(LEGACY_KEY_PATH, KEY_PATH);
    fs.chmodSync(KEY_PATH, 0o600);
    fs.unlinkSync(LEGACY_KEY_PATH);
  }

  const dir = path.dirname(KEY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(KEY_PATH)) {
    assertKeyFileMode(KEY_PATH, fs.statSync(KEY_PATH));
    return Buffer.from(fs.readFileSync(KEY_PATH, "utf-8").trim(), "hex");
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = getOrCreateKey();
  }
  return cachedKey;
}

export interface EncryptedData {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encrypt(plaintext: string): EncryptedData {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { encrypted, iv, authTag };
}

export function decrypt(data: EncryptedData): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, data.iv);
  decipher.setAuthTag(data.authTag);

  return Buffer.concat([
    decipher.update(data.encrypted),
    decipher.final(),
  ]).toString("utf-8");
}
