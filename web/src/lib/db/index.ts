import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB };

export function createDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/** Process-wide database handle (reused across hot reloads in dev). */
export function getDb(): DB {
  if (!globalForDb.__db) {
    globalForDb.__db = createDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db"));
  }
  return globalForDb.__db;
}

/** Test hook: swap the process-wide handle for an isolated database. */
export function setDb(db: DB) {
  globalForDb.__db = db;
}

export { schema };
