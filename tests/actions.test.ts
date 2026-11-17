import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { connect, type DB } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine } from "../src/lib/engine";
const context = vi.hoisted(() => ({
  headers: new Headers(),
  engine: null as Engine | null,
}));
vi.mock("next/headers", () => ({ headers: async () => context.headers }));
vi.mock("../src/lib/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/service")>();
  return { ...actual, engine: () => context.engine };
});
import { savePurchaseSummary } from "../src/app/actions";
let db: DB;
beforeEach(() => {
  db = connect(":memory:");
  seed(db);
  context.engine = new Engine(db);
  context.headers = new Headers({
    host: "localhost:3000",
    origin: "http://localhost:3000",
  });
});
afterEach(() => db.sqlite.close());
it("persists and returns a purchase summary through the server action", async () => {
  const result = await savePurchaseSummary();
  expect(result.data).toMatchObject({
    confirmedProcurement: [],
    purchasePlan: [],
    reservedDemand: [],
  });
  expect(
    context.engine!.one("SELECT COUNT(*) n FROM vendor_purchase_summaries").n,
  ).toBe(1);
});
it("rejects a cross-origin or remote server action before any mutation", async () => {
  context.headers.set("origin", "https://untrusted.example");
  expect((await savePurchaseSummary()).error).toContain("Cross-origin");
  context.headers = new Headers({ host: "public.example" });
  expect((await savePurchaseSummary()).error).toContain("Local administration");
  expect(
    context.engine!.one("SELECT COUNT(*) n FROM vendor_purchase_summaries").n,
  ).toBe(0);
});
