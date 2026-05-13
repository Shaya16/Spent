import "server-only";

import crypto from "crypto";
import fs from "fs";
import path from "path";

const KEY_PATH = path.join(process.cwd(), "data", ".encryption-key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getOrCreateKey(): Buffer {
  const dir = path.dirname(KEY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(KEY_PATH)) {
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
