import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine } from "../src/lib/engine";
it("uses SQLite transactions to protect the last unit across two real server processes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nammavandi-concurrency-"));
  const path = join(dir, "stock.db");
  const db = connect(path);
  seed(db);
  const e = new Engine(db);
  try {
    e.run("UPDATE daily_inventory SET stock=1000 WHERE id='i0'");
    const ids = ["c0", "c1"].map(
      (c) => e.message(c, "race-" + c, "1 kg tomato").orderId,
    );
    const attempt = (id: string) =>
      new Promise<{ code: number | null; output: string }>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["--import", "tsx", "tests/fixtures/reserve.ts", path, id],
            { stdio: ["ignore", "pipe", "pipe"] },
          );
          let output = "";
          child.stdout.on("data", (b) => (output += b));
          child.stderr.on("data", (b) => (output += b));
          child.on("error", reject);
          child.on("exit", (code) => resolve({ code, output }));
        },
      );
    const results = await Promise.all(ids.map(attempt));
    expect(results.map((r) => r.code).sort()).toEqual([0, 2]);
    expect(results.find((r) => r.code === 2)?.output).toContain(
      "Stock changed",
    );
    expect(
      e.one("SELECT stock,reserved FROM daily_inventory WHERE id='i0'"),
    ).toEqual({ stock: 1000, reserved: 1000 });
    expect(
      e.one("SELECT COUNT(*) n FROM orders WHERE status='CONFIRMED'").n,
    ).toBe(1);
  } finally {
    db.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
