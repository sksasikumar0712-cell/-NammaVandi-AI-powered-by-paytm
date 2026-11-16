import { createHmac, timingSafeEqual } from "node:crypto";
import PaytmChecksum from "paytmchecksum";
import { Engine } from "./engine";
export async function transcribe(file: File) {
  if (!process.env.SARVAM_API_KEY)
    return {
      text: "ara kilo vendakkai, rendu kattu arai keerai",
      mode: "mock",
      notice:
        "Sample transcription only. Your audio was not analysed. Edit the text before sending.",
    };
  const body = new FormData();
  body.set("file", file);
  body.set("model", process.env.SARVAM_MODEL || "saaras:v4");
  body.set("mode", "codemix");
  body.set("language_code", "unknown");
  const r = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("Sarvam transcription failed");
  const data = await r.json();
  return {
    text: String(data.transcript),
    mode: "sarvam",
    notice: "Review transcription before sending.",
  };
}
export async function extractImage(_file: File) {
  void _file;
  return {
    text: "1 kg tomato, 2 bunch coriander",
    mode: "mock",
    notice:
      "Sample extraction only. Your image was not analysed. Replace this text with your actual list.",
  };
}
export function verifyMeta(
  raw: string,
  signature: string | null,
  secret = process.env.WHATSAPP_APP_SECRET,
) {
  if (!secret || !signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
export async function sendWhatsApp(to: string, text: string) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID)
    throw Error("WhatsApp is not configured");
  const r = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v24.0"}/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok) throw Error("WhatsApp send failed");
}
export async function whatsappMedia(id: string) {
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const meta = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v24.0"}/${encodeURIComponent(id)}`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!meta.ok) throw Error("Media lookup failed");
  const info = await meta.json();
  if (info.file_size > 10 * 1024 * 1024) throw Error("Media exceeds 10 MB");
  const u = new URL(info.url);
  if (
    u.protocol !== "https:" ||
    !/(^|\.)(facebook\.com|fbcdn\.net)$/.test(u.hostname)
  )
    throw Error("Unexpected Meta media host");
  const r = await fetch(u, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("Media download failed");
  const blob = await r.blob();
  if (blob.size > 10 * 1024 * 1024) throw Error("Media exceeds 10 MB");
  return new File([blob], "whatsapp-media", { type: info.mime_type });
}
export class PaymentAdapter {
  constructor(private engine: Engine) {}
  private async api(path: string, fields: Record<string, unknown>) {
    if (
      process.env.PAYMENT_MODE !== "staging" ||
      !process.env.PAYTM_MID ||
      !process.env.PAYTM_MERCHANT_KEY
    )
      throw Error("Paytm staging credentials are missing");
    const body = { mid: process.env.PAYTM_MID, ...fields };
    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      process.env.PAYTM_MERCHANT_KEY,
    );
    const r = await fetch("https://securestage.paytmpayments.com" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { tokenType: "AES", signature } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error("Paytm request failed");
    const data = await r.json();
    if (
      !data.head?.signature ||
      !PaytmChecksum.verifySignature(
        JSON.stringify(data.body),
        process.env.PAYTM_MERCHANT_KEY,
        data.head.signature,
      )
    )
      throw Error("Paytm response signature invalid");
    if (data.body.resultInfo?.resultStatus !== "SUCCESS")
      throw Error(
        data.body.resultInfo?.resultMessage || "Paytm rejected request",
      );
    return data.body;
  }
  async create(id: string) {
    const p = this.engine.one("SELECT * FROM payments WHERE order_id=?", id);
    const o = this.engine.one("SELECT * FROM orders WHERE id=?", id);
    if (
      !p ||
      o.status === "CANCELLED" ||
      ["PAID", "REFUND_PENDING", "REFUNDED"].includes(p.status)
    )
      throw Error("Order cannot be paid");
    if (p.url) return { url: p.url };
    if (p.provider === "mock") {
      const url = "/playground?checkout=" + id;
      this.engine.run(
        "UPDATE payments SET url=?,status='AWAITING_PAYMENT' WHERE order_id=?",
        url,
        id,
      );
      return { url };
    }
    const data = await this.api("/link/create", {
      merchantRequestId: id,
      linkName: "NV" + id.replaceAll("-", ""),
      linkDescription: "NammaVandi order",
      linkType: "FIXED",
      amount: p.amount / 100,
      sendSms: false,
      sendEmail: false,
    });
    if (!data.linkId || !data.shortUrl)
      throw Error("Incomplete payment link response");
    this.engine.run(
      "UPDATE payments SET link_id=?,url=?,status='AWAITING_PAYMENT' WHERE order_id=?",
      String(data.linkId),
      data.shortUrl,
      id,
    );
    return { url: data.shortUrl };
  }
  async reconcile(id: string) {
    const p = this.engine.one("SELECT * FROM payments WHERE order_id=?", id);
    if (!p?.link_id || p.provider !== "paytm-staging")
      throw Error("No staging link to reconcile");
    const data = await this.api("/link/fetchTransaction", {
      linkId: Number(p.link_id),
      fetchAllTxns: true,
      pageNo: 1,
      pageSize: 100,
    });
    if (data.merchantId && data.merchantId !== process.env.PAYTM_MID)
      throw Error("Merchant mismatch");
    for (const txn of data.orders || []) {
      if (
        ["SUCCESS", "TXN_SUCCESS"].includes(txn.orderStatus) &&
        String(txn.mercUniqRef) === p.link_id
      ) {
        this.engine.settle(
          id,
          Math.round(Number(txn.txnAmount) * 100),
          String(txn.txnId),
          true,
          true,
        );
      }
    }
    return this.engine.one("SELECT status FROM payments WHERE order_id=?", id);
  }
  mock(id: string, success: boolean) {
    if (process.env.PAYMENT_MODE === "staging")
      throw Error("Mock checkout disabled");
    const p = this.engine.one("SELECT * FROM payments WHERE order_id=?", id);
    if (!p || p.provider !== "mock" || p.status === "CANCELLED")
      throw Error("No payable mock order");
    this.engine.settle(id, p.amount, "mock-" + id, true, success);
  }
  refund(id: string) {
    const p = this.engine.one("SELECT * FROM payments WHERE order_id=?", id);
    if (p?.provider !== "mock" || p.status !== "REFUND_PENDING")
      throw Error(
        "Live refunds require merchant dashboard processing and verification",
      );
    this.engine.run(
      "UPDATE payments SET status='REFUNDED' WHERE order_id=?",
      id,
    );
  }
}
export async function verifyPaytmCallback(params: Record<string, string>) {
  const { CHECKSUMHASH, ...body } = params;
  return (
    !!process.env.PAYTM_MERCHANT_KEY &&
    !!CHECKSUMHASH &&
    PaytmChecksum.verifySignature(
      body,
      process.env.PAYTM_MERCHANT_KEY,
      CHECKSUMHASH,
    )
  );
}
