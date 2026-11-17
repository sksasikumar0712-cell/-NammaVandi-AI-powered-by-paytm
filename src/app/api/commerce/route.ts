import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { engine, localRequest } from "@/lib/service";
import { today } from "@/lib/db";
import { PaymentAdapter } from "@/lib/adapters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(100);
const number = z.number().int().min(0).max(100000000);
const qty = number.min(1);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("message"),
    customerId: id,
    messageId: id,
    text: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("confirm"),
    id,
    handoff: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal("revise"), id, productId: id, quantity: qty }),
  z.object({
    action: z.literal("status"),
    id,
    status: z.enum(["PACKED", "READY", "DELIVERED", "CANCELLED"]),
  }),
  z.object({
    action: z.literal("quote"),
    id,
    price: number,
    quantity: qty,
    minimum: number,
    reject: z.boolean().optional(),
  }),
  z.object({ action: z.literal("decline"), id }),
  z.object({ action: z.literal("payment"), id }),
  z.object({ action: z.literal("reconcile"), id }),
  z.object({ action: z.literal("mockPay"), id, success: z.boolean() }),
  z.object({ action: z.literal("refund"), id }),
  z.object({ action: z.literal("summary") }),
  z.object({
    action: z.literal("inventory"),
    id,
    price: number,
    cost: number,
    stock: number,
    available: z.boolean(),
  }),
  z.object({
    action: z.literal("product"),
    name: z.string().min(1).max(80),
    tamil: z.string().min(1).max(80),
    aliases: z.string().max(300),
    category: z.string().min(1).max(40),
    unit: z.enum(["kg", "bunch", "100g"]),
    price: number,
    cost: number,
    stock: number,
  }),
  z.object({
    action: z.literal("route"),
    id,
    name: z.string().min(1).max(80),
    days: z.string().min(1).max(100),
    arrival: z.string().min(1).max(80),
    status: z.enum(["SCHEDULED", "ON_THE_WAY", "COMPLETED", "CANCELLED"]),
  }),
  z.object({ action: z.literal("prices"), text: z.string().min(1).max(5000) }),
]);
export async function GET(req: Request) {
  try {
    localRequest(req);
    return NextResponse.json(engine().snapshot());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
export async function POST(req: Request) {
  try {
    localRequest(req);
    const a = action.parse(await req.json());
    const e = engine();
    const p = new PaymentAdapter(e);
    let result: any = { ok: true };
    switch (a.action) {
      case "message":
        result = e.message(a.customerId, a.messageId, a.text);
        break;
      case "confirm":
        result = e.confirm(a.id, a.handoff);
        break;
      case "revise":
        e.revise(a.id, a.productId, a.quantity);
        break;
      case "status":
        e.change(a.id, a.status);
        break;
      case "quote":
        e.quote(a.id, a.price, a.quantity, a.minimum, a.reject);
        break;
      case "decline": {
        const r = e.one("SELECT * FROM special_requests WHERE id=?", a.id);
        if (!r) throw Error("Request not found");
        e.quote(a.id, 0, r.quantity, 0, true);
        break;
      }
      case "payment":
        result = await p.create(a.id);
        break;
      case "reconcile":
        result = await p.reconcile(a.id);
        break;
      case "mockPay":
        p.mock(a.id, a.success);
        break;
      case "refund":
        p.refund(a.id);
        break;
      case "summary":
        result = e.summary();
        break;
      case "inventory":
        e.db.sqlite
          .transaction(() => {
            const old = e.one(
              "SELECT * FROM daily_inventory WHERE product_id=? AND day=?",
              a.id,
              today(),
            );
            if (old && a.stock < old.reserved)
              throw Error("Stock cannot be below reserved quantity");
            if (old)
              e.run(
                "UPDATE daily_inventory SET price=?,cost=?,stock=?,available=? WHERE id=?",
                a.price,
                a.cost,
                a.stock,
                a.available ? 1 : 0,
                old.id,
              );
            else
              e.run(
                "INSERT INTO daily_inventory(id,product_id,day,cost,price,stock,available) VALUES (?,?,?,?,?,?,?)",
                randomUUID(),
                a.id,
                today(),
                a.cost,
                a.price,
                a.stock,
                a.available ? 1 : 0,
              );
          })
          .immediate();
        break;
      case "product":
        e.db.sqlite.transaction(() => {
          const pid = randomUUID();
          e.run(
            "INSERT INTO products(id,merchant_id,name,tamil,aliases,category,unit) VALUES (?,?,?,?,?,?,?)",
            pid,
            "m1",
            a.name,
            a.tamil,
            a.aliases,
            a.category,
            a.unit,
          );
          e.run(
            "INSERT INTO daily_inventory(id,product_id,day,cost,price,stock) VALUES (?,?,?,?,?,?)",
            randomUUID(),
            pid,
            today(),
            a.cost,
            a.price,
            a.stock,
          );
        })();
        break;
      case "route":
        e.run(
          "UPDATE routes SET name=?,days=?,arrival=?,status=? WHERE id=?",
          a.name,
          a.days,
          a.arrival,
          a.status,
          a.id,
        );
        break;
      case "prices": {
        const lines = a.text.trim().split("\n");
        const catalog = e.catalog();
        e.db.sqlite
          .transaction(() => {
            for (const line of lines) {
              const [name, cost, price] = line.split(",").map((s) => s.trim());
              const product = catalog.find((p) =>
                [p.name, p.tamil, ...p.aliases.split(",")].some(
                  (n) => n.toLowerCase() === name?.toLowerCase(),
                ),
              );
              if (
                !product?.inventory_id ||
                !cost ||
                !price ||
                !/^\d+(\.\d{1,2})?$/.test(cost) ||
                !/^\d+(\.\d{1,2})?$/.test(price)
              )
                throw Error(
                  "Each line must be: existing product name, wholesale rupees, selling rupees. Nothing was changed.",
                );
              e.run(
                "UPDATE daily_inventory SET cost=?,price=? WHERE id=?",
                Math.round(Number(cost) * 100),
                Math.round(Number(price) * 100),
                product.inventory_id,
              );
            }
          })
          .immediate();
        break;
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Please check all fields and quantities."
            : (error as Error).message,
      },
      { status: 400 },
    );
  }
}
