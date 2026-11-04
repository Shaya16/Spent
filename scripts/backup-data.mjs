/**
 * Back up the SQLite database and the encryption key into <data>/backups/<stamp>, keeping the newest five.
 * Backups stay inside the data directory (the Docker volume), because the key makes them as sensitive as the data.
 *
 * Usage: node scripts/backup-data.mjs [dataDir] [stamp]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const KEEP = 5;

export async function backupData(dataDir, stamp) {
  const dbFile = path.join(dataDir, "spent.db");
  if (!fs.existsSync(dbFile)) return null;

  const root = path.join(dataDir, "backups");
  const target = path.join(root, stamp);
  fs.mkdirSync(target, { recursive: true });

  // SQLite's online backup gives a consistent copy even while the app is writing (WAL mode).
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(path.join(target, "spent.db"));
  } finally {
    db.close();
  }

  const key = path.join(dataDir, ".encryption-key");
  if (fs.existsSync(key)) {
    fs.copyFileSync(key, path.join(target, ".encryption-key"));
    fs.chmodSync(path.join(target, ".encryption-key"), 0o600);
  }

  const old = fs.readdirSync(root).sort().slice(0, -KEEP);
  for (const name of old) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = path.resolve(process.argv[2] ?? process.env.SPENT_DATA_DIR ?? "data");
  const stamp = process.argv[3] ?? new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const target = await backupData(dataDir, stamp);
  console.log(target ? `Backup saved to ${target}` : "No database yet, nothing to back up.");
}
