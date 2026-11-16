import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync } from "node:fs";
import * as schema from "./schema";
export function connect(path = process.env.DATABASE_PATH || "./nammavandi.db") {
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(readFileSync(process.cwd() + "/migrations/0001.sql", "utf8"));
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
