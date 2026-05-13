import "server-only";

import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  let migrationDir = MIGRATIONS_DIR;
  if (!fs.existsSync(migrationDir)) {
    migrationDir = path.join(process.cwd(), "src/server/db/migrations");
  }

  if (!fs.existsSync(migrationDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationDir, file), "utf-8");

    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
    })();
  }
}
