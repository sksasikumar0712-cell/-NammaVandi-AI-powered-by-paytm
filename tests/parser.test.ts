import { beforeAll, afterAll, expect, it } from "vitest";
import { connect, type DB } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine } from "../src/lib/engine";
import { parseList } from "../src/lib/parser";
let db: DB, e: Engine;
beforeAll(() => {
  db = connect(":memory:");
  seed(db);
  e = new Engine(db);
});
afterAll(() => db.sqlite.close());
const parse = (s: string) => parseList(s, e.catalog());
it.each([
  "0.5 kg tomato",
  ".5 kg tomato",
  "1/2 kg tomato",
  "tomato 0.5 kg",
  "அரை கிலோ தக்காளி",
])("keeps fractional quantities intact: %s", (s) => {
  expect(parse(s)[0]).toMatchObject({
    productId: "p0",
    quantity: 500,
    ambiguous: false,
  });
});
it.each([
  "tomato 1 kg onion 2 kg",
  "1 kg tomato 2 kg onion",
  "tomato 1 kg, onion 2 kg",
])("assigns each quantity once: %s", (s) => {
  expect(parse(s).map((p) => p.quantity)).toEqual([1000, 2000]);
});
it("converts weight into the actual catalog unit", () => {
  expect(parse("1 kg jasmine")[0].quantity).toBe(10000);
  expect(parse("100 g jasmine")[0].quantity).toBe(1000);
  expect(parse("250 grams vendakkai")[0].quantity).toBe(250);
});
it("flags incompatible, zero and conflicting quantities", () => {
  for (const s of ["1 kg coriander", "0 kg tomato", "tomato 1 kg 2 kg"])
    expect(parse(s)[0].ambiguous).toBe(true);
});
it("matches full aliases without matching substrings of other products", () => {
  expect(parse("1 kg peppermint")).toEqual([]);
  expect(parse("1 kg tomato ketchup")).toHaveLength(1);
  expect(parse("இரண்டு கட்டு அரைக்கீரை")[0]).toMatchObject({
    productId: "p5",
    quantity: 2000,
  });
});
it("combines repeated explicit product mentions", () => {
  expect(parse("1 kg tomato, 0.5 kg tomato")[0]).toMatchObject({
    quantity: 1500,
    ambiguous: false,
  });
});
