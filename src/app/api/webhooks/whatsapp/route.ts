import { engine } from "@/lib/service";
import {
  verifyMeta,
  whatsappMedia,
  transcribe,
  extractImage,
  sendWhatsApp,
} from "@/lib/adapters";
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return p.get("hub.mode") === "subscribe" &&
    !!process.env.WHATSAPP_VERIFY_TOKEN &&
    p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
    ? new Response(p.get("hub.challenge"))
    : new Response("Forbidden", { status: 403 });
}
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMeta(raw, req.headers.get("x-hub-signature-256")))
    return new Response("Invalid signature", { status: 401 });
  try {
    const payload = JSON.parse(raw);
    const e = engine();
    for (const entry of payload.entry || [])
      for (const change of entry.changes || [])
        for (const m of change.value?.messages || []) {
          const c = e.one(
            "SELECT * FROM customers WHERE phone=? AND opt_in=1",
            m.from,
          );
          if (!c) continue;
          const text = m.text?.body;
          if (m.type === "audio" || m.type === "image") {
            const previous = e.one(
              "SELECT response FROM messages WHERE id=? AND customer_id=?",
              m.id,
              c.id,
            );
            if (previous) {
              await sendWhatsApp(m.from, JSON.parse(previous.response).reply);
              continue;
            }
            const file = await whatsappMedia(m[m.type].id);
            const extraction = await (m.type === "audio"
              ? transcribe(file)
              : extractImage(file));
            const reply =
              extraction.notice +
              "\n" +
              extraction.text +
              "\nPlease send corrected text to create a draft.";
            e.run(
              "INSERT OR IGNORE INTO messages(id,customer_id,text,response) VALUES (?,?,?,?)",
              m.id,
              c.id,
              `[${m.type} attachment]`,
              JSON.stringify({ reply }),
            );
            await sendWhatsApp(m.from, reply);
            continue;
          }
          if (typeof text !== "string") continue;
          // Only inbound service-window replies; no unsolicited broadcasts or group API.
          const r = e.message(c.id, m.id, text);
          await sendWhatsApp(
            m.from,
            r.reply +
              (r.orderId
                ? "\nDraft " +
                  r.orderId +
                  ". Vendor-assisted confirmation in local MVP."
                : ""),
          );
        }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Webhook processing failed; retry allowed" },
      { status: 500 },
    );
  }
}
