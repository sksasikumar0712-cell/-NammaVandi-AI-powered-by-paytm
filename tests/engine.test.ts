import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { connect, type DB } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine, assertTransition } from "../src/lib/engine";
import { parseList, lineTotal } from "../src/lib/parser";
import {
  PaymentAdapter,
  verifyMeta,
  transcribe,
  extractImage,
} from "../src/lib/adapters";
import { createHmac } from "node:crypto";
let db: DB, e: Engine;
beforeEach(() => {
  db = connect(":memory:");
  seed(db);
  e = new Engine(db);
  delete process.env.PAYMENT_MODE;
});
afterEach(() => db.sqlite.close());
const order = (text = "1 kg tomato", c = "c0", id = crypto.randomUUID()) =>
  e.message(c, id, text).orderId;
describe("Commerce engine integration", () => {
  it("creates a draft, then reserves on explicit confirmation", () => {
    const id = order();
    expect(
      e.one("SELECT reserved FROM daily_inventory WHERE id=?", "i0").reserved,
    ).toBe(0);
    e.confirm(id, "Leave with security");
    expect(
      e.one("SELECT reserved FROM daily_inventory WHERE id=?", "i0").reserved,
    ).toBe(1000);
    expect(e.one("SELECT * FROM orders WHERE id=?", id)).toMatchObject({
      status: "CONFIRMED",
      total: 4000,
      handoff: "Leave with security",
    });
  });
  it("prices the exact Tanglish example at 65 rupees, excluding drumstick", () => {
    const id = order(
      "Anna, ara kilo vendakkai, rendu kattu arai keerai venum. Murungakkai irundha athuvum venum.",
    );
    expect(e.one("SELECT total FROM orders WHERE id=?", id).total).toBe(6500);
    expect(
      e.one(
        "SELECT quantity,status FROM special_requests WHERE order_id=?",
        id,
      ),
    ).toMatchObject({ quantity: 1000, status: "PENDING_VENDOR" });
  });
  it("parses Tamil and Indian fractions", () => {
    const c = e.catalog();
    expect(
      parseList("அரை கிலோ வெண்டைக்காய், இரண்டு கட்டு அரைக்கீரை", c).map(
        (i) => i.quantity,
      ),
    ).toEqual([500, 2000]);
    expect(parseList("kaalu kilo tomato", c)[0].quantity).toBe(250);
    expect(parseList("oru kilo vengayam", c)[0].quantity).toBe(1000);
    expect(parseList("500 grams carrot", c)[0].quantity).toBe(500);
  });
  it("matches Tamil, English and Tanglish aliases", () => {
    for (const alias of ["tomato", "thakkali", "தக்காளி"])
      expect(parseList("1 kg " + alias, e.catalog())[0].productId).toBe("p0");
  });
  it("uses integer paise and deterministic rounding", () => {
    expect(lineTotal(5000, 500)).toBe(2500);
    expect(lineTotal(3333, 250)).toBe(833);
  });
  it("flags missing quantities for review", () => {
    expect(parseList("vendakkai", e.catalog())[0].ambiguous).toBe(true);
  });
  it("requires vendor quote and customer confirmation before procurement", () => {
    const id = order("naalaiku murungakkai 1 kg vangitu vaanga");
    expect(() => e.confirm(id, "Door")).toThrow("Vendor");
    expect(e.summary().confirmedProcurement).toHaveLength(0);
    const r = e.one("SELECT * FROM special_requests WHERE order_id=?", id);
    e.quote(r.id, 8000, 1000, 1000);
    expect(e.summary().confirmedProcurement).toHaveLength(0);
    e.confirm(id, "Door");
    expect(e.summary().confirmedProcurement[0]).toMatchObject({
      name: "Drumstick",
      quantity: 1000,
    });
    expect(e.one("SELECT total FROM orders WHERE id=?", id).total).toBe(8000);
  });
  it("enforces minimum quantities", () => {
    const id = order("1 kg murungakkai");
    const r = e.one("SELECT * FROM special_requests WHERE order_id=?", id);
    e.quote(r.id, 8000, 1000, 2000);
    expect(() => e.confirm(id, "Door")).toThrow("minimum");
  });
  it("two customers cannot reserve the last unit and failed transactions roll back", () => {
    e.run("UPDATE daily_inventory SET stock=1000 WHERE id='i0'");
    const a = order(),
      b = order("1 kg onion, 1 kg tomato", "c1");
    e.confirm(a, "Door");
    expect(() => e.confirm(b, "Door")).toThrow("Stock changed");
    expect(
      e.one("SELECT reserved FROM daily_inventory WHERE id='i1'").reserved,
    ).toBe(0);
  });
  it("deduplicates webhook messages and confirmation", () => {
    const id = order("1 kg tomato", "c0", "wamid123");
    expect(order("1 kg tomato", "c0", "wamid123")).toBe(id);
    e.confirm(id, "Door");
    e.confirm(id, "Door");
    expect(e.one("SELECT COUNT(*) n FROM orders").n).toBe(1);
    expect(
      e.one("SELECT reserved FROM daily_inventory WHERE id='i0'").reserved,
    ).toBe(1000);
  });
  it("mock checkout fails, retries and succeeds server-side", async () => {
    const id = order();
    e.confirm(id, "Door");
    const p = new PaymentAdapter(e);
    await p.create(id);
    p.mock(id, false);
    expect(
      e.one("SELECT status FROM payments WHERE order_id=?", id).status,
    ).toBe("FAILED");
    p.mock(id, true);
    p.mock(id, true);
    expect(
      e.one("SELECT status FROM payments WHERE order_id=?", id).status,
    ).toBe("PAID");
  });
  it("never accepts unverified or wrong-amount payments", () => {
    const id = order();
    e.confirm(id, "Door");
    expect(() => e.settle(id, 4000, "txn", false, true)).toThrow("Unverified");
    expect(() => e.settle(id, 1, "txn", true, true)).toThrow("amount");
    expect(
      e.one("SELECT status FROM payments WHERE order_id=?", id).status,
    ).toBe("UNPAID");
  });
  it("cancellation releases stock once and tracks refunds separately", () => {
    const id = order();
    e.confirm(id, "Door");
    new PaymentAdapter(e).mock(id, true);
    e.change(id, "CANCELLED");
    expect(
      e.one("SELECT reserved FROM daily_inventory WHERE id='i0'").reserved,
    ).toBe(0);
    expect(
      e.one("SELECT status FROM payments WHERE order_id=?", id).status,
    ).toBe("REFUND_PENDING");
    new PaymentAdapter(e).refund(id);
    expect(
      e.one("SELECT status FROM payments WHERE order_id=?", id).status,
    ).toBe("REFUNDED");
    expect(() => e.change(id, "CANCELLED")).toThrow();
  });
  it("aggregates street demand from confirmed orders only", () => {
    const a = order(),
      b = order("2 kg tomato", "c3");
    order("8 kg tomato", "c1");
    e.confirm(a, "Door");
    e.confirm(b, "Door");
    expect(e.snapshot().demand).toEqual([
      expect.objectContaining({ street: "R.N. Apartment", quantity: 3000 }),
    ]);
  });
  it("delivery deducts stock and rejects skipped transitions", () => {
    const id = order();
    e.confirm(id, "Door");
    expect(() => e.change(id, "DELIVERED")).toThrow();
    e.change(id, "PACKED");
    e.change(id, "READY");
    e.change(id, "DELIVERED");
    expect(
      e.one("SELECT stock,reserved FROM daily_inventory WHERE id='i0'"),
    ).toEqual({ stock: 17000, reserved: 0 });
    expect(() => assertTransition("DELIVERED", "CONFIRMED")).toThrow();
  });
  it("rejects stale prices without reserving inventory", () => {
    const id = order();
    e.run("UPDATE daily_inventory SET price=4500 WHERE id='i0'");
    expect(() => e.confirm(id, "Door")).toThrow("Prices");
  });
  it("can reject special items and confirm the available portion", () => {
    const id = order("1 kg tomato, 1 kg drumstick");
    const r = e.one("SELECT * FROM special_requests WHERE order_id=?", id);
    e.quote(r.id, 0, 1000, 0, true);
    e.confirm(id, "Door");
    expect(e.one("SELECT total FROM orders WHERE id=?", id).total).toBe(4000);
  });
  it("validates raw Meta webhook signatures", () => {
    const raw = '{"test":1}',
      key = "test";
    const sig = "sha256=" + createHmac("sha256", key).update(raw).digest("hex");
    expect(verifyMeta(raw, sig, key)).toBe(true);
    expect(verifyMeta(raw + " ", sig, key)).toBe(false);
    expect(verifyMeta(raw, null, key)).toBe(false);
  });
  it("works without paid credentials and labels mock media honestly", async () => {
    delete process.env.SARVAM_API_KEY;
    expect((await transcribe(new File(["x"], "sample.wav"))).mode).toBe("mock");
    expect((await extractImage(new File(["x"], "list.png"))).notice).toContain(
      "not analysed",
    );
    expect(e.snapshot().catalog).toHaveLength(15);
  });
});
