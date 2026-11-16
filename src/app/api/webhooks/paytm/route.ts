import { engine } from "@/lib/service";
import { verifyPaytmCallback, PaymentAdapter } from "@/lib/adapters";
export async function POST(req: Request) {
  try {
    const body = Object.fromEntries(new URLSearchParams(await req.text()));
    if (!(await verifyPaytmCallback(body)))
      return new Response("Invalid checksum", { status: 401 });
    const e = engine();
    const linkId = body.LINKID || body.LINK_ID || body.MERC_UNQ_REF;
    const p = e.one("SELECT * FROM payments WHERE link_id=?", linkId || "");
    if (!p) return new Response("Unknown payment link", { status: 404 });
    await new PaymentAdapter(e).reconcile(p.order_id);
    return Response.json({ ok: true });
  } catch {
    return new Response("Reconciliation failed", { status: 400 });
  }
}
