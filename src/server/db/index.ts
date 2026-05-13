import "server-only";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { runMigrations } from "./migrate";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "spent.db");

function createDatabase(): Database.Database {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  runMigrations(db);

  return db;
}

declare global {
  var _db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis._db) {
    globalThis._db = createDatabase();
  }
  return globalThis._db;
}
