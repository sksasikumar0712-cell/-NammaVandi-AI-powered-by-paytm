import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temp = mkdtempSync(join(tmpdir(), "nammavandi-smoke-"));
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    env: {
      ...process.env,
      DATABASE_PATH: join(temp, "smoke.db"),
      PAYMENT_MODE: "mock",
      SARVAM_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (b) => (logs += b));
server.stderr.on("data", (b) => (logs += b));
const base = "http://127.0.0.1:3100";
const post = async (body) => {
  const r = await fetch(base + "/api/commerce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  return j;
};
try {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/api/commerce");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const page of [
    "dashboard",
    "inventory",
    "orders",
    "routes",
    "playground",
  ]) {
    const r = await fetch(base + "/" + page);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /NAMMAVANDI/);
  }
  const message = {
    action: "message",
    customerId: "c0",
    messageId: "http-smoke",
    text: "ara kilo vendakkai, rendu kattu arai keerai",
  };
  const draft = await post(message);
  assert.equal((await post(message)).orderId, draft.orderId);
  await post({
    action: "confirm",
    id: draft.orderId,
    handoff: "Leave with security",
  });
  await post({ action: "payment", id: draft.orderId });
  await post({ action: "mockPay", id: draft.orderId, success: false });
  await post({ action: "mockPay", id: draft.orderId, success: true });
  let snapshot = await (await fetch(base + "/api/commerce")).json();
  let order = snapshot.orders.find((o) => o.id === draft.orderId);
  assert.equal(order.total, 6500);
  assert.equal(order.payment_status, "PAID");
  for (const status of ["PACKED", "READY", "DELIVERED"])
    await post({ action: "status", id: draft.orderId, status });
  const special = await post({
    ...message,
    messageId: "http-special",
    text: "naalaiku murungakkai 1 kg vangitu vaanga",
  });
  snapshot = await (await fetch(base + "/api/commerce")).json();
  order = snapshot.orders.find((o) => o.id === special.orderId);
  await post({
    action: "quote",
    id: order.specials[0].id,
    price: 8000,
    quantity: 1000,
    minimum: 1000,
  });
  await post({ action: "confirm", id: special.orderId, handoff: "At my door" });
  const summary = await post({ action: "summary" });
  assert.equal(summary.confirmedProcurement[0].quantity, 1000);
  const forged = await fetch(base + "/api/webhooks/paytm", {
    method: "POST",
    body: "STATUS=TXN_SUCCESS&ORDERID=" + draft.orderId,
  });
  assert.equal(forged.status, 401);
  const unsigned = await fetch(base + "/api/webhooks/whatsapp", {
    method: "POST",
    body: "{}",
  });
  assert.equal(unsigned.status, 401);
  const crossOrigin = await fetch(base + "/api/commerce", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  assert.equal(crossOrigin.status, 400);
  const unclear = await post({
    ...message,
    messageId: "http-unclear",
    text: "vendakkai",
  });
  const denied = await fetch(base + "/api/commerce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "confirm",
      id: unclear.orderId,
      handoff: "Door",
    }),
  });
  assert.equal(denied.status, 400);
  await post({
    action: "revise",
    id: unclear.orderId,
    productId: "p2",
    quantity: 250,
  });
  await post({
    action: "confirm",
    id: unclear.orderId,
    handoff: "Leave with security",
  });
  snapshot = await (await fetch(base + "/api/commerce")).json();
  assert.equal(
    snapshot.orders.find((o) => o.id === unclear.orderId).total,
    1250,
  );
  await post({ action: "prices", text: "Tomato,30,42" });
  const badImport = await fetch(base + "/api/commerce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "prices",
      text: "Tomato,30,50\nUnknown product,10,20",
    }),
  });
  assert.equal(badImport.status, 400);
  snapshot = await (await fetch(base + "/api/commerce")).json();
  assert.equal(snapshot.catalog.find((p) => p.id === "p0").price, 4200);
  const form = new FormData();
  form.set(
    "file",
    new File(["sample"], "handwritten.png", { type: "image/png" }),
  );
  const media = await fetch(base + "/api/media", {
    method: "POST",
    body: form,
  });
  assert.equal(media.status, 200);
  const extracted = await media.json();
  assert.equal(extracted.mode, "mock");
  assert.match(extracted.notice, /not analysed/);
  console.log(
    "PASS: five pages HTTP 200; HTTP cart → confirmation → mock failure/success → delivery; special quote → confirmation → procurement; unclear quantity blocked → corrected → reserved; price-import rollback; labelled mock image upload; duplicate dedup; forged callbacks and cross-origin mutation rejected.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  rmSync(temp, { recursive: true, force: true });
}
