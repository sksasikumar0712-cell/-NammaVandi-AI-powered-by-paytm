import { randomUUID } from "node:crypto";
import { DB, today } from "./db";
import { parseList, lineTotal } from "./parser";
import * as schema from "./schema";
export const transitions: Record<string, string[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  PENDING_VENDOR_APPROVAL: ["AWAITING_CUSTOMER_CONFIRMATION", "CANCELLED"],
  AWAITING_CUSTOMER_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw Error(`Cannot change ${from} to ${to}`);
}
export class Engine {
  constructor(public db: DB) {}
  all(sql: string, ...args: any[]): any[] {
    return this.db.sqlite.prepare(sql).all(...args);
  }
  one(sql: string, ...args: any[]): any {
    return this.db.sqlite.prepare(sql).get(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.sqlite.prepare(sql).run(...args);
  }
  catalog() {
    return this.all(
      "SELECT p.*,i.id inventory_id,i.day,i.cost,i.price,i.stock,i.reserved,i.available FROM products p LEFT JOIN daily_inventory i ON i.product_id=p.id AND i.day=?",
      today(),
    );
  }
  private resolveQuantity(id: string, productId: string, quantity: number) {
    const message = this.one(
      "SELECT * FROM messages WHERE json_extract(response, '$.orderId')=?",
      id,
    );
    if (!message) return;
    const response = JSON.parse(message.response);
    response.parsed = response.parsed?.map((p: any) =>
      p.productId === productId
        ? { ...p, quantity, ambiguous: false, reason: undefined }
        : p,
    );
    this.run(
      "UPDATE messages SET response=? WHERE id=?",
      JSON.stringify(response),
      message.id,
    );
  }
  revise(id: string, productId: string, quantity: number) {
    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 100000000
    )
      throw Error("Enter a valid positive quantity");
    return this.db.sqlite
      .transaction(() => {
        const o = this.one("SELECT * FROM orders WHERE id=?", id);
        if (
          !o ||
          ![
            "DRAFT",
            "PENDING_VENDOR_APPROVAL",
            "AWAITING_CUSTOMER_CONFIRMATION",
          ].includes(o.status)
        )
          throw Error("Only an unconfirmed cart can be edited");
        const item = this.one(
          "SELECT * FROM order_items WHERE order_id=? AND product_id=?",
          id,
          productId,
        );
        const request = this.one(
          "SELECT * FROM special_requests WHERE order_id=? AND product_id=? AND status IN ('PENDING_VENDOR','QUOTED')",
          id,
          productId,
        );
        if (!item && !request) throw Error("Item not found in this cart");
        const p = this.catalog().find((p) => p.id === productId)!;
        if (item && p.available && p.stock - p.reserved >= quantity) {
          this.run(
            "UPDATE order_items SET quantity=?,price=?,amount=?,inventory_id=? WHERE id=?",
            quantity,
            p.price,
            lineTotal(p.price, quantity),
            p.inventory_id,
            item.id,
          );
        } else {
          if (item) {
            this.run("DELETE FROM order_items WHERE id=?", item.id);
            this.run(
              "INSERT INTO special_requests(id,order_id,product_id,quantity) VALUES (?,?,?,?)",
              randomUUID(),
              id,
              productId,
              quantity,
            );
          } else {
            // A changed procurement quantity needs a fresh vendor quote.
            this.run(
              "UPDATE special_requests SET quantity=?,price=NULL,minimum=0,status='PENDING_VENDOR' WHERE id=?",
              quantity,
              request.id,
            );
          }
        }
        this.resolveQuantity(id, productId, quantity);
        const pending = this.one(
          "SELECT id FROM special_requests WHERE order_id=? AND status='PENDING_VENDOR'",
          id,
        );
        const quoted = this.one(
          "SELECT id FROM special_requests WHERE order_id=? AND status='QUOTED'",
          id,
        );
        const total = this.one(
          "SELECT COALESCE(SUM(amount),0) total FROM order_items WHERE order_id=?",
          id,
        ).total;
        this.run(
          "UPDATE orders SET total=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          total,
          pending
            ? "PENDING_VENDOR_APPROVAL"
            : quoted
              ? "AWAITING_CUSTOMER_CONFIRMATION"
              : "DRAFT",
          id,
        );
      })
      .immediate();
  }
  message(customerId: string, messageId: string, text: string) {
    return this.db.sqlite
      .transaction(() => {
        const old = this.one("SELECT * FROM messages WHERE id=?", messageId);
        if (old) {
          if (old.customer_id !== customerId)
            throw Error("Message identity mismatch");
          return JSON.parse(old.response);
        }
        const c = this.one("SELECT * FROM customers WHERE id=?", customerId);
        if (!c) throw Error("Unknown customer");
        const catalog = this.catalog();
        const route = this.one(
          "SELECT * FROM routes WHERE street_id=?",
          c.street_id,
        );
        const parsed = parseList(text, catalog);
        let result: any;
        if (!parsed.length) {
          result = {
            reply: /arrival|when|time|வரு|eppo/i.test(text)
              ? route
                ? `Vendor schedule: ${route.days}, ${route.arrival}. Route: ${route.status}. This is an estimate, not a live arrival promise.${route.status === "CANCELLED" ? " This route is cancelled; contact your vendor for the next visit." : ""}`
                : "No route window has been set. Please ask your vendor."
              : /stock|available|price|list/i.test(text)
                ? catalog
                    .filter((p) => p.available && p.stock > p.reserved)
                    .map((p) => `${p.name}: ₹${p.price / 100}/${p.unit}`)
                    .join("\n")
                : "Please send a shopping list with quantities, for example: ara kilo vendakkai, rendu kattu arai keerai. Unmatched items need manual clarification.",
          };
        } else {
          if (!route || route.status === "CANCELLED")
            throw Error(
              "No active route is available for this street. Please ask your vendor.",
            );
          const id = randomUUID();
          const future = /naalaiku|tomorrow|நாளை/i.test(text);
          const visitDay = future
            ? new Date(
                new Date(today() + "T12:00:00+05:30").getTime() + 86400000,
              ).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
            : today();
          this.run(
            "INSERT INTO orders(id,customer_id,route_id,visit,status) VALUES (?,?,?,?,?)",
            id,
            customerId,
            route.id,
            visitDay + " " + route.arrival,
            "DRAFT",
          );
          let total = 0;
          let specials = 0;
          for (const item of parsed) {
            const p = catalog.find((p) => p.id === item.productId)!;
            if (
              !p.available ||
              p.stock - p.reserved < item.quantity ||
              /naalaiku|tomorrow|நாளை/i.test(text)
            ) {
              this.run(
                "INSERT INTO special_requests(id,order_id,product_id,quantity) VALUES (?,?,?,?)",
                randomUUID(),
                id,
                p.id,
                item.quantity,
              );
              specials++;
            } else {
              const amount = lineTotal(p.price, item.quantity);
              this.run(
                "INSERT INTO order_items(id,order_id,product_id,inventory_id,quantity,price,amount) VALUES (?,?,?,?,?,?,?)",
                randomUUID(),
                id,
                p.id,
                p.inventory_id,
                item.quantity,
                p.price,
                amount,
              );
              total += amount;
            }
          }
          this.run(
            "UPDATE orders SET total=?,status=? WHERE id=?",
            total,
            specials ? "PENDING_VENDOR_APPROVAL" : "DRAFT",
            id,
          );
          result = {
            orderId: id,
            parsed,
            reply: `Please review all quantities and items. ${parsed.some((p) => p.ambiguous) ? "Some quantities were unclear; 1 unit is suggested, not confirmed. " : ""}${specials ? "Unavailable or future items need a vendor quote. You can decline these to reserve the available items." : "Your prices come from today’s vendor inventory. Stock is reserved only when you confirm."}`,
          };
        }
        this.db.orm
          .insert(schema.messages)
          .values({
            id: messageId,
            customer_id: customerId,
            text,
            response: JSON.stringify(result),
          })
          .run();
        return result;
      })
      .immediate();
  }
  confirm(id: string, handoff: string) {
    return this.db.sqlite
      .transaction(() => {
        const o = this.one("SELECT * FROM orders WHERE id=?", id);
        if (!o) throw Error("Order not found");
        if (["CONFIRMED", "PACKED", "READY", "DELIVERED"].includes(o.status))
          return o;
        if (
          this.one(
            "SELECT id FROM special_requests WHERE order_id=? AND status='PENDING_VENDOR'",
            id,
          )
        )
          throw Error("Vendor must quote or reject special requests first");
        assertTransition(o.status, "CONFIRMED");
        const items = this.all(
          "SELECT * FROM order_items WHERE order_id=?",
          id,
        );
        const message = this.one(
          "SELECT response FROM messages WHERE json_extract(response, '$.orderId')=?",
          id,
        );
        const parsed = JSON.parse(message?.response || "{}").parsed || [];
        if (
          items.some((it) =>
            parsed.some(
              (p: any) => p.productId === it.product_id && p.ambiguous,
            ),
          )
        )
          throw Error(
            "Please set each unclear quantity in the cart before confirming",
          );
        const special = this.all(
          "SELECT * FROM special_requests WHERE order_id=? AND status='QUOTED'",
          id,
        );
        if (!items.length && !special.length)
          throw Error("No items to confirm");
        for (const it of items) {
          const stock = this.one(
            "SELECT * FROM daily_inventory WHERE id=?",
            it.inventory_id,
          );
          if (stock.day !== today() || stock.price !== it.price)
            throw Error(
              "Prices or date changed. Send a new list for a fresh quote.",
            );
          const r = this.run(
            "UPDATE daily_inventory SET reserved=reserved+? WHERE id=? AND available=1 AND stock-reserved>=?",
            it.quantity,
            it.inventory_id,
            it.quantity,
          );
          if (r.changes !== 1)
            throw Error("Stock changed. Please revise your list.");
        }
        for (const r of special) {
          if (r.quantity < r.minimum)
            throw Error("Special request is below vendor minimum");
          this.run(
            "UPDATE special_requests SET status='CONFIRMED' WHERE id=?",
            r.id,
          );
        }
        const total =
          items.reduce((s, i) => s + i.amount, 0) +
          special.reduce((s, r) => s + lineTotal(r.price, r.quantity), 0);
        this.run(
          "UPDATE orders SET total=?,handoff=?,status='CONFIRMED',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          total,
          handoff,
          id,
        );
        this.run(
          "INSERT INTO payments(id,order_id,amount,provider) VALUES (?,?,?,?)",
          randomUUID(),
          id,
          total,
          process.env.PAYMENT_MODE === "staging" ? "paytm-staging" : "mock",
        );
        return this.one("SELECT * FROM orders WHERE id=?", id);
      })
      .immediate();
  }
  quote(
    id: string,
    price: number,
    quantity: number,
    minimum: number,
    reject = false,
  ) {
    if (
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !Number.isSafeInteger(minimum) ||
      minimum < 0
    )
      throw Error("Invalid vendor quote");
    return this.db.sqlite
      .transaction(() => {
        const r = this.one("SELECT * FROM special_requests WHERE id=?", id);
        if (!r || !["PENDING_VENDOR", "QUOTED"].includes(r.status))
          throw Error("Request cannot be changed");
        this.run(
          "UPDATE special_requests SET price=?,quantity=?,minimum=?,status=? WHERE id=?",
          price,
          quantity,
          minimum,
          reject ? "REJECTED" : "QUOTED",
          id,
        );
        this.resolveQuantity(r.order_id, r.product_id, quantity);
        if (
          !this.one(
            "SELECT id FROM special_requests WHERE order_id=? AND status='PENDING_VENDOR'",
            r.order_id,
          )
        )
          this.run(
            "UPDATE orders SET status='AWAITING_CUSTOMER_CONFIRMATION' WHERE id=?",
            r.order_id,
          );
        return r.order_id;
      })
      .immediate();
  }
  change(id: string, status: string) {
    return this.db.sqlite
      .transaction(() => {
        const o = this.one("SELECT * FROM orders WHERE id=?", id);
        if (!o) throw Error("Order not found");
        assertTransition(o.status, status);
        if (
          status === "CANCELLED" &&
          ["CONFIRMED", "PACKED", "READY"].includes(o.status)
        ) {
          for (const i of this.all(
            "SELECT * FROM order_items WHERE order_id=?",
            id,
          ))
            this.run(
              "UPDATE daily_inventory SET reserved=reserved-? WHERE id=?",
              i.quantity,
              i.inventory_id,
            );
          this.run(
            "UPDATE payments SET status=CASE WHEN status='PAID' THEN 'REFUND_PENDING' ELSE 'CANCELLED' END WHERE order_id=?",
            id,
          );
        }
        if (status === "CANCELLED")
          this.run(
            "UPDATE special_requests SET status='CANCELLED' WHERE order_id=? AND status!='REJECTED'",
            id,
          );
        if (status === "DELIVERED")
          for (const i of this.all(
            "SELECT * FROM order_items WHERE order_id=?",
            id,
          ))
            this.run(
              "UPDATE daily_inventory SET stock=stock-?,reserved=reserved-? WHERE id=?",
              i.quantity,
              i.quantity,
              i.inventory_id,
            );
        this.run(
          "UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          status,
          id,
        );
      })
      .immediate();
  }
  // Called only by server adapters after verification; never exposed as a generic mutation.
  settle(
    id: string,
    amount: number,
    txn: string,
    verified: boolean,
    success: boolean,
  ) {
    if (!verified) throw Error("Unverified payment");
    if (
      !txn.trim() ||
      txn === "undefined" ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    )
      throw Error("Invalid payment details");
    return this.db.sqlite
      .transaction(() => {
        const p = this.one("SELECT * FROM payments WHERE order_id=?", id);
        if (!p || p.amount !== amount) throw Error("Payment amount mismatch");
        if (["PAID", "REFUND_PENDING", "REFUNDED"].includes(p.status)) return;
        const o = this.one("SELECT * FROM orders WHERE id=?", id);
        if (!success && o.status === "CANCELLED") return;
        this.run(
          "UPDATE payments SET status=?,transaction_id=? WHERE order_id=?",
          success
            ? o.status === "CANCELLED"
              ? "REFUND_PENDING"
              : "PAID"
            : "FAILED",
          success ? txn : null,
          id,
        );
      })
      .immediate();
  }
  snapshot() {
    const orders = this.all(
      "SELECT o.*,c.name customer,s.name street,p.status payment_status,p.url payment_url FROM orders o JOIN customers c ON c.id=o.customer_id JOIN streets s ON s.id=c.street_id LEFT JOIN payments p ON p.order_id=o.id ORDER BY o.created_at DESC",
    ).map((o) => ({
      ...o,
      parsed:
        JSON.parse(
          this.one(
            "SELECT response FROM messages WHERE json_extract(response, '$.orderId')=? LIMIT 1",
            o.id,
          )?.response || "{}",
        ).parsed || [],
      items: this.all(
        "SELECT i.*,p.name,p.unit FROM order_items i JOIN products p ON p.id=i.product_id WHERE order_id=?",
        o.id,
      ),
      specials: this.all(
        "SELECT r.*,p.name,p.unit FROM special_requests r JOIN products p ON p.id=r.product_id WHERE order_id=?",
        o.id,
      ),
    }));
    const demand = this.all(
      "SELECT s.id street_id,s.name street,p.id product_id,p.name,p.unit,substr(o.visit,1,10) visit_day,SUM(i.quantity) quantity FROM order_items i JOIN orders o ON o.id=i.order_id JOIN customers c ON c.id=o.customer_id JOIN streets s ON s.id=c.street_id JOIN products p ON p.id=i.product_id WHERE o.status IN ('CONFIRMED','PACKED','READY') GROUP BY s.id,p.id,substr(o.visit,1,10)",
    );
    const procurement = this.all(
      "SELECT s.id street_id,s.name street,p.id product_id,p.name,p.unit,substr(o.visit,1,10) visit_day,r.status,SUM(r.quantity) quantity FROM special_requests r JOIN orders o ON o.id=r.order_id JOIN customers c ON c.id=o.customer_id JOIN streets s ON s.id=c.street_id JOIN products p ON p.id=r.product_id WHERE o.status NOT IN ('CANCELLED','DELIVERED') AND r.status NOT IN ('REJECTED','CANCELLED') GROUP BY s.id,p.id,r.status,substr(o.visit,1,10)",
    );
    const purchasePlan = Array.from(
      procurement
        .filter((r) => r.status === "CONFIRMED")
        .reduce((plan, r) => {
          const key = r.product_id + ":" + r.visit_day;
          const old = plan.get(key);
          plan.set(key, {
            product_id: r.product_id,
            name: r.name,
            unit: r.unit,
            visit_day: r.visit_day,
            quantity: (old?.quantity || 0) + r.quantity,
          });
          return plan;
        }, new Map<string, any>())
        .values(),
    );
    return {
      purchasePlan,
      catalog: this.catalog(),
      orders,
      customers: this.all("SELECT * FROM customers"),
      routes: this.all(
        "SELECT r.*, (SELECT COUNT(*) FROM customers c WHERE c.street_id=r.street_id) customers FROM routes r",
      ),
      demand,
      procurement,
      messages: this.all("SELECT * FROM messages ORDER BY created_at"),
      today: today(),
      paymentMode: process.env.PAYMENT_MODE === "staging" ? "staging" : "mock",
    };
  }
  summary() {
    const data = this.snapshot();
    const content = JSON.stringify({
      day: today(),
      confirmedProcurement: data.procurement.filter(
        (r) => r.status === "CONFIRMED",
      ),
      pendingRequests: data.procurement.filter((r) => r.status !== "CONFIRMED"),
      reservedDemand: data.demand,
      purchasePlan: data.purchasePlan,
    });
    this.db.orm
      .insert(schema.vendorPurchaseSummaries)
      .values({ id: randomUUID(), day: today(), content })
      .run();
    return JSON.parse(content);
  }
}
