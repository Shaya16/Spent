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

    // Some migrations need to drop and recreate FK-referenced tables. SQLite
    // can't disable foreign_keys inside a transaction, and the recreate
    // pattern temporarily produces dangling refs, so flip the pragma off
    // for the duration of the migration. Then verify with foreign_key_check
    // and turn it back on once we're done.
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      })();

      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `Foreign key violations after migration ${file}: ${JSON.stringify(violations)}`
        );
      }
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
}
