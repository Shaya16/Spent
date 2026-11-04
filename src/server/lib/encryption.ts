import "server-only";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataDir } from "./data-dir";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

// The key lives next to the database, so a Docker volume or SPENT_DATA_DIR keeps both together.
function keyPath(): string {
  return path.join(dataDir(), ".encryption-key");
}

// Before SPENT_DATA_DIR applied to the key, it was always written to ./data.
function legacyKeyPath(): string {
  return path.join(process.cwd(), "data", ".encryption-key");
}

function assertKeyFileMode(stat: fs.Stats, file: string): void {
  // POSIX-only. Windows NTFS ACLs don't map to mode bits meaningfully,
  // so skip there and rely on the default user profile permissions.
  if (process.platform === "win32") return;

  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `Refusing to read encryption key: ${file} has mode ${mode.toString(8).padStart(3, "0")}, expected 600. ` +
        `Fix with: chmod 600 ${file}`,
    );
  }
}

function getOrCreateKey(): Buffer {
  const file = keyPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Adopt a key from the old location; a new key would make saved credentials unreadable.
  const legacy = legacyKeyPath();
  if (!fs.existsSync(file) && legacy !== file && fs.existsSync(legacy)) {
    assertKeyFileMode(fs.statSync(legacy), legacy);
    fs.writeFileSync(file, fs.readFileSync(legacy, "utf-8").trim(), { mode: 0o600 });
  }

  if (fs.existsSync(file)) {
    assertKeyFileMode(fs.statSync(file), file);
    return Buffer.from(fs.readFileSync(file, "utf-8").trim(), "hex");
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
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
