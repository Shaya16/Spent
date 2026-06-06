import "server-only";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDb } from "./index";
import * as schema from "./schema";

// Drizzle ORM is the typed query layer. It wraps the same better-sqlite3
// connection that getDb() owns (single connection, WAL, migrations already run),
// so raw-SQL and Drizzle calls share one transaction-capable handle. Cached on
// globalThis for HMR safety, mirroring the getDb() singleton pattern.
declare global {
  var _orm: BetterSQLite3Database<typeof schema> | undefined;
}

export function getOrm(): BetterSQLite3Database<typeof schema> {
  if (!globalThis._orm) {
    globalThis._orm = drizzle(getDb(), { schema });
  }
  return globalThis._orm;
}
