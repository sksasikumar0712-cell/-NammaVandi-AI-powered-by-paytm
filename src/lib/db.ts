import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";
export function connect(path = process.env.DATABASE_PATH || "./nammavandi.db") {
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const directory = join(process.cwd(), "migrations");
  // Each migration and its bookkeeping commit together; existing databases upgrade safely.
  sqlite
    .transaction(() => {
      for (const name of readdirSync(directory)
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort()) {
        if (
          sqlite
            .prepare("SELECT name FROM schema_migrations WHERE name=?")
            .get(name)
        )
          continue;
        sqlite.exec(readFileSync(join(directory, name), "utf8"));
        sqlite
          .prepare("INSERT INTO schema_migrations(name) VALUES (?)")
          .run(name);
      }
    })
    .immediate();
  return { sqlite, orm: drizzle(sqlite, { schema }) };
}
export type DB = ReturnType<typeof connect>;
let instance: DB;
export function database() {
  return (instance ??= connect());
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
