import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { connect, type DB } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine } from "../src/lib/engine";
import { PaymentAdapter, verifyPaytmCallback } from "../src/lib/adapters";
import PaytmChecksum from "paytmchecksum";
let db: DB, e: Engine, id: string;
const key = "1234567890123456";
beforeEach(() => {
  vi.stubEnv("PAYMENT_MODE", "staging");
  vi.stubEnv("PAYTM_MID", "TESTMID");
  vi.stubEnv("PAYTM_MERCHANT_KEY", key);
  db = connect(":memory:");
  seed(db);
  e = new Engine(db);
  id = e.message("c0", "staging", "1 kg tomato").orderId;
  e.confirm(id, "Door");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  db.sqlite.close();
});
async function signed(body: any) {
  return Response.json({
    body,
    head: {
      signature: await PaytmChecksum.generateSignature(
        JSON.stringify(body),
        key,
      ),
    },
  });
}
it("creates and persists a signed staging link without notifying customers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const req = JSON.parse(options.body);
      expect(req.body.amount).toBe(40);
      expect(req.body.sendSms).toBe(false);
      expect(
        PaytmChecksum.verifySignature(
          JSON.stringify(req.body),
          key,
          req.head.signature,
        ),
      ).toBe(true);
      return signed({
        resultInfo: { resultStatus: "SUCCESS" },
        linkId: 123,
        shortUrl: "https://example.test/link",
      });
    }),
  );
  expect((await new PaymentAdapter(e).create(id)).url).toBe(
    "https://example.test/link",
  );
  expect(e.one("SELECT status FROM payments WHERE order_id=?", id).status).toBe(
    "AWAITING_PAYMENT",
  );
});
it("rejects unsigned provider response", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      body: {
        resultInfo: { resultStatus: "SUCCESS" },
        linkId: 123,
        shortUrl: "https://example.test",
      },
    }),
  );
  await expect(new PaymentAdapter(e).create(id)).rejects.toThrow("signature");
  expect(e.one("SELECT status FROM payments WHERE order_id=?", id).status).toBe(
    "UNPAID",
  );
});
it("reconciles a signed matching link and amount only", async () => {
  e.run("UPDATE payments SET link_id=? WHERE order_id=?", "123", id);
  vi.stubGlobal("fetch", async () =>
    signed({
      resultInfo: { resultStatus: "SUCCESS" },
      merchantId: "TESTMID",
      orders: [
        {
          mercUniqRef: "123",
          txnAmount: 40,
          txnId: "txn-good",
          orderStatus: "SUCCESS",
        },
      ],
    }),
  );
  await new PaymentAdapter(e).reconcile(id);
  expect(e.one("SELECT status FROM payments WHERE order_id=?", id).status).toBe(
    "PAID",
  );
});
it("ignores success for another payment link", async () => {
  e.run("UPDATE payments SET link_id=? WHERE order_id=?", "123", id);
  vi.stubGlobal("fetch", async () =>
    signed({
      resultInfo: { resultStatus: "SUCCESS" },
      orders: [
        {
          mercUniqRef: "456",
          txnAmount: 40,
          txnId: "txn-other",
          orderStatus: "TXN_SUCCESS",
        },
      ],
    }),
  );
  await new PaymentAdapter(e).reconcile(id);
  expect(e.one("SELECT status FROM payments WHERE order_id=?", id).status).toBe(
    "UNPAID",
  );
});
it("disables mock success in staging and verifies callback checksums", async () => {
  expect(() => new PaymentAdapter(e).mock(id, true)).toThrow("disabled");
  const body = { MID: "TESTMID", STATUS: "TXN_SUCCESS" };
  const CHECKSUMHASH = await PaytmChecksum.generateSignature(body, key);
  expect(await verifyPaytmCallback({ ...body, CHECKSUMHASH })).toBe(true);
  expect(
    await verifyPaytmCallback({ ...body, STATUS: "TXN_FAILURE", CHECKSUMHASH }),
  ).toBe(false);
});
