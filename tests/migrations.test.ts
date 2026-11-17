import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../src/lib/db";
it("upgrades an existing MVP database once without losing records", () => {
  const dir = mkdtempSync(join(tmpdir(), "nammavandi-migration-")),
    path = join(dir, "existing.db");
  const legacy = new Database(path);
  legacy.exec(readFileSync("migrations/0001.sql", "utf8"));
  legacy
    .prepare(
      "INSERT INTO merchants(id,name) VALUES ('existing','Existing vendor')",
    )
    .run();
  legacy.close();
  try {
    for (let i = 0; i < 2; i++) {
      const db = connect(path);
      expect(
        db.sqlite.prepare("SELECT COUNT(*) n FROM schema_migrations").get(),
      ).toEqual({ n: 2 });
      expect(
        db.sqlite
          .prepare("SELECT name FROM merchants WHERE id='existing'")
          .get(),
      ).toEqual({ name: "Existing vendor" });
      db.sqlite.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
