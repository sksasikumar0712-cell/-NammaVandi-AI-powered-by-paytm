"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingBasket,
  ClipboardList,
  Route,
  MessageCircle,
  Leaf,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Send,
  Mic,
  ImagePlus,
  ShieldCheck,
  Clock,
  MapPin,
  IndianRupee,
  Package,
  Check,
  Copy,
  Store,
  ChevronRight,
  Download,
} from "lucide-react";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: n % 100 ? 2 : 0,
  }).format((n || 0) / 100);
const quantity = (q: number, u: string) => `${q / 1000} ${u}`;
const label = (s: string) =>
  s?.toLowerCase().replaceAll("_", " ") || "not paid";
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["inventory", "Daily inventory", ShoppingBasket],
  ["orders", "Orders & requests", ClipboardList],
  ["routes", "Street routes", Route],
  ["playground", "WhatsApp playground", MessageCircle],
] as const;
const titles: Record<string, string> = {
  dashboard: "A fresh start to your day.",
  inventory: "Fresh stock. Clear prices.",
  orders: "Every order, taken care of.",
  routes: "Your neighbourhood rounds.",
  playground: "A familiar chat. A smarter cart.",
};
const descriptions: Record<string, string> = {
  dashboard: "Know what’s reserved, where to go, and what to bring.",
  inventory:
    "Set your prices and availability. Your customers see what you confirm.",
  orders: "From the first message to a happy doorstep.",
  routes: "Give your customers a little more certainty about their morning.",
  playground:
    "Try the complete customer journey, in English, Tamil or Tanglish.",
};
function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export default function App({ page }: { page: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const r = await fetch("/api/commerce");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function act(a: any) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/commerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function summary() {
    const r = await act({ action: "summary" });
    if (r) {
      const blob = new Blob([JSON.stringify(r, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nammavandi-purchase-" + data.today + ".json";
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Purchase summary saved and downloaded.");
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <ShoppingBasket size={25} />
          </span>
          <span>
            NAMMAVANDI <b>AI</b>
            <small>Powered by Paytm · prototype</small>
          </span>
        </Link>
        <div className="workspace">
          <div className="avatar">S</div>
          <div>
            <strong>Selvam’s fresh cart</strong>
            <small>Coimbatore · Demo vendor</small>
          </div>
          <ChevronRight size={16} />
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(([url, name, Icon]) => (
            <Link
              key={url}
              href={"/" + url}
              className={page === url ? "active" : ""}
            >
              <Icon size={20} />
              {name}
              {url === "playground" && <span className="new">TRY IT</span>}
            </Link>
          ))}
        </nav>
        <div className="side-note">
          <Leaf size={24} />
          <strong>Buy with a little more clarity.</strong>
          <p>Tomorrow’s shopping starts with today’s customer requests.</p>
          <Link href="/orders">
            View market requests <ArrowRight size={15} />
          </Link>
        </div>
        <div className="local">
          <span />
          Local-first demo<small>Fictional data · No real payments</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            {nav.find((n) => n[0] === page)?.[1]}
          </span>
          <div>
            <Badge tone="neutral">Demo mode</Badge>
            <span className="date">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </span>
            <div className="avatar small">S</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "dashboard"
                  ? "VANAKKAM, SELVAM"
                  : page === "playground"
                    ? "THE NAMMAVANDI EXPERIENCE"
                    : "YOUR DAILY BUSINESS"}
              </div>
              <h1>{titles[page]}</h1>
              <p>{descriptions[page]}</p>
            </div>
            {page === "dashboard" && (
              <button onClick={summary} disabled={busy}>
                <Download size={17} />
                Purchase summary
              </button>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button className="ghost" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button className="ghost" onClick={() => setNotice("")}>
                Dismiss
              </button>
            </div>
          )}
          {!data ? (
            <div className="card empty">
              {error
                ? "Could not load your workspace."
                : "Getting your cart ready…"}
              <button
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Reload
              </button>
            </div>
          ) : (
            <>
              {page === "dashboard" && <Dashboard d={data} />}{" "}
              {page === "inventory" && <Inventory d={data} act={act} />}{" "}
              {page === "orders" && <Orders d={data} act={act} />}{" "}
              {page === "routes" && (
                <Routes d={data} act={act} notify={setNotice} />
              )}{" "}
              {page === "playground" && (
                <Playground
                  d={data}
                  act={act}
                  refresh={refresh}
                  notify={setNotice}
                  fail={setError}
                />
              )}
            </>
          )}
          <footer>
            <Leaf size={14} /> Built for the people who know your street.
            <span>
              Independent prototype. No official Paytm affiliation or
              sponsorship.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Dashboard({ d }: { d: any }) {
  const active = d.orders.filter(
    (o: any) =>
      ["CONFIRMED", "PACKED", "READY", "DELIVERED"].includes(o.status) &&
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(o.created_at.replace(" ", "T") + "Z"),
      ) === d.today,
  );
  const stats = [
    [
      "Confirmed orders",
      active.length,
      ClipboardList,
      "Ready for your next round",
    ],
    [
      "Reserved-order value",
      money(active.reduce((s: number, o: any) => s + o.total, 0)),
      ShoppingBasket,
      "Vendor-confirmed prices",
    ],
    [
      "Pending payments",
      money(
        active
          .filter((o: any) => !["PAID", "REFUNDED"].includes(o.payment_status))
          .reduce((s: number, o: any) => s + o.total, 0),
      ),
      IndianRupee,
      "Pay online or on delivery",
    ],
    [
      "Customers today",
      new Set(active.map((o: any) => o.customer_id)).size,
      Store,
      "Your neighbourhood regulars",
    ],
  ];
  return (
    <>
      <div className="stats">
        {stats.map(([t, v, Icon, sub]: any) => (
          <div className="card stat" key={t}>
            <div>
              {t}
              <span className="icon-soft">
                <Icon size={18} />
              </span>
            </div>
            <strong>{v}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <div className="hero">
        <div>
          <Badge>TRUST, WITH A LITTLE TECHNOLOGY</Badge>
          <h2>
            Your street. Your people.
            <br />
            Your next round, sorted.
          </h2>
          <p>
            Let customers reserve what they need.
            <br />
            Head to the market knowing what to buy.
          </p>
          <Link className="button" href="/playground">
            Try a WhatsApp order <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="hero-art">
          <div className="floating-note">
            <span className="avatar">
              <Check />
            </span>
            <div>
              <b>“Anna, usual keerai venum!”</b>
              <small>Familiar conversations. Confirmed orders.</small>
            </div>
          </div>
          <div className="basket-art">
            <ShoppingBasket strokeWidth={1.2} />
            <Leaf className="leaf-art" />
          </div>
          <div className="art-label">
            <ShieldCheck size={16} /> Personal trust, preserved.
          </div>
        </div>
      </div>
      <div className="columns">
        <section className="card">
          <div className="section-title">
            <div>
              <h2>On your route today</h2>
              <p>Arrival windows your customers can plan around</p>
            </div>
            <Link href="/routes">
              Manage routes <ArrowRight size={16} />
            </Link>
          </div>
          {d.routes.map((r: any, i: number) => (
            <div className="route-row" key={r.id}>
              <span className="step">{i + 1}</span>
              <div>
                <strong>{r.name}</strong>
                <small>
                  <Clock size={13} />
                  {r.arrival} · {r.customers} customers
                </small>
              </div>
              <Badge tone={r.status === "CANCELLED" ? "amber" : "neutral"}>
                {label(r.status)}
              </Badge>
            </div>
          ))}
        </section>
        <section className="card market">
          <div className="section-title">
            <div>
              <h2>Bring it from the market</h2>
              <p>Requests worth planning for</p>
            </div>
            <span className="icon-soft">
              <Leaf size={20} />
            </span>
          </div>
          {d.procurement.length ? (
            d.procurement.map((r: any, i: number) => (
              <div className="request-row" key={i}>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.street}</small>
                </div>
                <div>
                  <strong>{quantity(r.quantity, r.unit)}</strong>
                  <Badge tone={r.status === "CONFIRMED" ? "green" : "amber"}>
                    {label(r.status)}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">
              No market requests yet. Try one in the playground.
            </p>
          )}
          <Link className="text-link" href="/orders">
            Review special requests <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <div className="columns">
        <section className="card">
          <div className="section-title">
            <div>
              <h2>Street-wise confirmed demand</h2>
              <p>Reserved items, grouped by neighbourhood</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Street</th>
                <th>Product</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {d.demand.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.street}</td>
                  <td>{r.name}</td>
                  <td>
                    <b>{quantity(r.quantity, r.unit)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.demand.length && (
            <p className="empty">Confirm an order to see demand here.</p>
          )}
        </section>
        <section className="card">
          <div className="section-title">
            <div>
              <h2>Keep an eye on stock</h2>
              <p>Top up only after checking demand</p>
            </div>
            <Badge tone="amber">Low stock</Badge>
          </div>
          {d.catalog
            .filter((p: any) => !p.available || p.stock - p.reserved <= 3000)
            .map((p: any) => (
              <div className="request-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.tamil}</small>
                </div>
                <Badge tone="amber">
                  {p.available
                    ? quantity(p.stock - p.reserved, p.unit) + " left"
                    : "Unavailable"}
                </Badge>
              </div>
            ))}
          <Link className="text-link" href="/inventory">
            Update inventory <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
function Inventory({ d, act }: { d: any; act: (a: any) => Promise<any> }) {
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<any>(null),
    [paste, setPaste] = useState(false),
    [prices, setPrices] = useState("");
  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.currentTarget));
    const r = await act(
      edit.id
        ? {
            action: "inventory",
            id: edit.id,
            cost: Math.round(Number(f.cost) * 100),
            price: Math.round(Number(f.price) * 100),
            stock: Math.round(Number(f.stock) * 1000),
            available: f.available === "on",
          }
        : {
            action: "product",
            ...f,
            cost: Math.round(Number(f.cost) * 100),
            price: Math.round(Number(f.price) * 100),
            stock: Math.round(Number(f.stock) * 1000),
          },
    );
    if (r) setEdit(null);
  }
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search products"
            placeholder="Search English, Tamil or Tanglish…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div>
          <button className="secondary" onClick={() => setPaste(!paste)}>
            <ClipboardList size={17} />
            Paste price list
          </button>
          <button onClick={() => setEdit({})}>
            <Plus size={18} />
            Add product
          </button>
        </div>
      </div>
      <div className="info-strip">
        <ShieldCheck size={18} />
        You set the price. The agent never guesses. All seeded prices are
        fictional demo values.
      </div>
      {paste && (
        <section className="card form-card">
          <h2>Apply your wholesaler’s prices</h2>
          <p>
            One line per product: name, wholesale ₹, selling ₹. Values are per
            listed unit. Review before applying.
          </p>
          <textarea
            value={prices}
            onChange={(e) => setPrices(e.target.value)}
            placeholder={"Tomato, 30, 40\nOnion, 25, 35"}
            rows={4}
          />
          <button
            onClick={async () => {
              if (await act({ action: "prices", text: prices }))
                setPaste(false);
            }}
          >
            Apply these prices
          </button>
        </section>
      )}
      {edit && (
        <section className="card form-card">
          <h2>{edit.id ? "Edit " + edit.name : "Add a product"}</h2>
          <form onSubmit={save}>
            <div className="form-grid">
              {!edit.id && (
                <>
                  <label>
                    English name
                    <input name="name" required />
                  </label>
                  <label>
                    Tamil name
                    <input name="tamil" required />
                  </label>
                  <label>
                    Tanglish aliases
                    <input
                      name="aliases"
                      placeholder="Comma-separated aliases"
                    />
                  </label>
                  <label>
                    Category
                    <input name="category" defaultValue="Vegetables" required />
                  </label>
                  <label>
                    Unit
                    <select name="unit">
                      <option>kg</option>
                      <option>bunch</option>
                      <option>100g</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                Wholesale ₹ / {edit.unit || "unit"}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="cost"
                  defaultValue={(edit.cost || 0) / 100}
                  required
                />
              </label>
              <label>
                Selling ₹ / {edit.unit || "unit"}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="price"
                  defaultValue={(edit.price || 0) / 100}
                  required
                />
              </label>
              <label>
                Stock ({edit.unit || "units"})
                <input
                  type="number"
                  step="0.001"
                  min={(edit.reserved || 0) / 1000}
                  name="stock"
                  defaultValue={(edit.stock || 0) / 1000}
                  required
                />
              </label>
              {edit.id && (
                <label className="check">
                  <input
                    type="checkbox"
                    name="available"
                    defaultChecked={!!edit.available}
                  />
                  Available for orders
                </label>
              )}
            </div>
            <button type="submit">Save product</button>
            <button
              type="button"
              className="ghost"
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </form>
        </section>
      )}
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit</th>
              <th>Wholesale</th>
              <th>Selling price</th>
              <th>Stock</th>
              <th>Reserved</th>
              <th>Can promise</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.catalog
              .filter((p: any) =>
                (p.name + p.tamil + p.aliases)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span
                        className={
                          "product-icon " +
                          (p.category === "Greens" ? "green" : "")
                        }
                      >
                        <Leaf size={20} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.tamil}</small>
                        <small>{p.aliases}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.unit}</td>
                  <td>{money(p.cost)}</td>
                  <td>
                    <strong>{money(p.price)}</strong>
                    <small>{p.day || "Not priced today"}</small>
                  </td>
                  <td>{(p.stock || 0) / 1000}</td>
                  <td>{(p.reserved || 0) / 1000}</td>
                  <td>
                    <strong>
                      {((p.stock || 0) - (p.reserved || 0)) / 1000}
                    </strong>
                  </td>
                  <td>
                    <Badge tone={p.available ? "green" : "amber"}>
                      {p.available ? "Available" : "Unavailable"}
                    </Badge>
                  </td>
                  <td>
                    <button className="secondary" onClick={() => setEdit(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function OrderCard({
  o,
  act,
  customer = false,
  mode = "mock",
}: {
  o: any;
  act: (a: any) => Promise<any>;
  customer?: boolean;
  mode?: string;
}) {
  const [handoff, setHandoff] = useState(o.handoff),
    [checkout, setCheckout] = useState(false);
  useEffect(() => {
    if (
      mode === "mock" &&
      new URLSearchParams(window.location.search).get("checkout") === o.id &&
      !["PAID", "CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(
        o.payment_status,
      )
    )
      setCheckout(true);
  }, [mode, o.id, o.payment_status]);
  const draft = ["DRAFT", "AWAITING_CUSTOMER_CONFIRMATION"].includes(o.status);
  return (
    <article className="card order-card">
      <div className="order-head">
        <div>
          <strong>{customer ? "Your shopping cart" : o.customer}</strong>
          <small>
            #{o.id.slice(0, 8)} · {o.street}
          </small>
        </div>
        <Badge tone={o.status === "CANCELLED" ? "neutral" : "green"}>
          {label(o.status)}
        </Badge>
      </div>
      {o.items.map((i: any) => (
        <div className="line-item" key={i.id}>
          <span>
            {i.name}
            {o.parsed?.some(
              (p: any) => p.productId === i.product_id && p.ambiguous,
            ) &&
              [
                "DRAFT",
                "PENDING_VENDOR_APPROVAL",
                "AWAITING_CUSTOMER_CONFIRMATION",
              ].includes(o.status) && (
                <small className="danger">
                  Quantity unclear: review this suggested quantity.
                </small>
              )}
            <small>
              {quantity(i.quantity, i.unit)} × {money(i.price)}/{i.unit}
            </small>
          </span>
          <strong>{money(i.amount)}</strong>
        </div>
      ))}
      {o.specials.map((r: any) => (
        <div className="special" key={r.id}>
          <div>
            <strong>
              {r.name} · {quantity(r.quantity, r.unit)}
            </strong>
            <Badge tone="amber">{label(r.status)}</Badge>
          </div>
          {r.status === "QUOTED" && (
            <p>
              Vendor quote: {money(r.price)}/{r.unit}. Total:{" "}
              {money(Math.round((r.price * r.quantity) / 1000))}. Minimum:{" "}
              {quantity(r.minimum, r.unit)}.
            </p>
          )}
          {!customer && ["PENDING_VENDOR", "QUOTED"].includes(r.status) && (
            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                const f = new FormData(ev.currentTarget);
                await act({
                  action: "quote",
                  id: r.id,
                  price: Math.round(Number(f.get("price")) * 100),
                  quantity: Math.round(Number(f.get("quantity")) * 1000),
                  minimum: Math.round(Number(f.get("minimum")) * 1000),
                });
              }}
            >
              <div className="quote-grid">
                <label>
                  Price ₹ / {r.unit}
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={r.price ? r.price / 100 : ""}
                    required
                  />
                </label>
                <label>
                  Quantity ({r.unit})
                  <input
                    name="quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    defaultValue={r.quantity / 1000}
                    required
                  />
                </label>
                <label>
                  Minimum ({r.unit})
                  <input
                    name="minimum"
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={r.minimum / 1000}
                  />
                </label>
              </div>
              <button className="secondary" type="submit">
                Approve & send quote
              </button>
            </form>
          )}
          {["PENDING_VENDOR", "QUOTED"].includes(r.status) && (
            <button
              className="ghost"
              onClick={() => act({ action: "decline", id: r.id })}
            >
              {customer ? "Skip this request" : "Reject unavailable item"}
            </button>
          )}
        </div>
      ))}
      <div className="total">
        <span>{draft ? "Review total" : "Order total"}</span>
        <strong>
          {money(
            o.total +
              (draft
                ? o.specials
                    .filter((r: any) => r.status === "QUOTED")
                    .reduce(
                      (s: number, r: any) =>
                        s + Math.round((r.price * r.quantity) / 1000),
                      0,
                    )
                : 0),
          )}
        </strong>
      </div>
      <div className="order-details">
        <span>
          <Clock size={14} />
          {o.visit}
        </span>
        <span>
          <MapPin size={14} />
          {o.handoff}
        </span>
        <span>
          <ShieldCheck size={14} />
          Payment: {label(o.payment_status)}
        </span>
      </div>
      {draft && (
        <>
          <label>
            Delivery handoff
            <select
              value={handoff}
              onChange={(e) => setHandoff(e.target.value)}
            >
              <option>At my door</option>
              <option>Leave with security</option>
              <option>Leave with neighbour (call first)</option>
            </select>
          </label>
          <p className="fine">
            Confirm every quantity above. To correct an item, cancel this draft
            and send a revised list. Prepayment is optional.
          </p>
          <button onClick={() => act({ action: "confirm", id: o.id, handoff })}>
            <Check size={16} />
            Confirm quantities & reserve
          </button>
        </>
      )}
      <div className="actions">
        {["CONFIRMED", "PACKED", "READY"].includes(o.status) &&
          !["PAID", "REFUND_PENDING", "REFUNDED"].includes(
            o.payment_status,
          ) && (
            <button
              className="payment-button"
              onClick={async () => {
                const r = await act({ action: "payment", id: o.id });
                if (r) {
                  if (mode === "mock") setCheckout(true);
                  else window.open(r.url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              {mode === "mock" ? "Mock Paytm checkout" : "Open Paytm staging"}
            </button>
          )}
        {mode === "staging" && o.payment_url && (
          <button
            className="secondary"
            onClick={() => act({ action: "reconcile", id: o.id })}
          >
            Verify payment
          </button>
        )}
        {!customer && ["CONFIRMED", "PACKED", "READY"].includes(o.status) && (
          <button
            className="secondary"
            onClick={() =>
              act({
                action: "status",
                id: o.id,
                status: {
                  CONFIRMED: "PACKED",
                  PACKED: "READY",
                  READY: "DELIVERED",
                }[o.status as "CONFIRMED"],
              })
            }
          >
            <Package size={16} />
            {
              {
                CONFIRMED: "Mark packed",
                PACKED: "Ready for delivery",
                READY: "Mark delivered",
              }[o.status as "CONFIRMED"]
            }
          </button>
        )}
        {!["DELIVERED", "CANCELLED"].includes(o.status) && (
          <button
            className="ghost danger"
            onClick={() =>
              act({ action: "status", id: o.id, status: "CANCELLED" })
            }
          >
            Cancel order
          </button>
        )}
        {o.payment_status === "REFUND_PENDING" && mode === "mock" && (
          <button
            className="secondary"
            onClick={() => act({ action: "refund", id: o.id })}
          >
            Simulate verified refund
          </button>
        )}
      </div>
      {checkout && (
        <div className="checkout">
          <Badge tone="blue">MOCK PAYTM · NO MONEY MOVES</Badge>
          <h3>{money(o.total)}</h3>
          <p>This checkout tests the server payment adapter.</p>
          <button
            className="payment-button"
            onClick={async () => {
              if (await act({ action: "mockPay", id: o.id, success: true }))
                setCheckout(false);
            }}
          >
            Simulate success
          </button>
          <button
            className="secondary"
            onClick={async () => {
              if (await act({ action: "mockPay", id: o.id, success: false }))
                setCheckout(false);
            }}
          >
            Simulate failure
          </button>
        </div>
      )}
    </article>
  );
}
function Orders({ d, act }: { d: any; act: (a: any) => Promise<any> }) {
  const [filter, setFilter] = useState("All");
  const rows = d.orders.filter(
    (o: any) =>
      filter === "All" ||
      (filter === "Requests"
        ? o.specials.some((r: any) => r.status === "PENDING_VENDOR")
        : o.status === filter),
  );
  return (
    <>
      <div className="tabs">
        {[
          "All",
          "Requests",
          "CONFIRMED",
          "PACKED",
          "DELIVERED",
          "CANCELLED",
        ].map((f) => (
          <button
            key={f}
            className={filter === f ? "selected" : ""}
            onClick={() => setFilter(f)}
          >
            {label(f)}
          </button>
        ))}
      </div>
      <div className="orders-grid">
        {rows.map((o: any) => (
          <OrderCard key={o.id} o={o} act={act} mode={d.paymentMode} />
        ))}
      </div>
      {!rows.length && (
        <div className="card empty">
          No orders here yet. <Link href="/playground">Try the playground</Link>
        </div>
      )}
    </>
  );
}
function Routes({
  d,
  act,
  notify,
}: {
  d: any;
  act: (a: any) => Promise<any>;
  notify: (s: string) => void;
}) {
  const [edit, setEdit] = useState("");
  return (
    <div className="route-grid">
      {d.routes.map((r: any, i: number) => {
        const stock = d.catalog
          .filter((p: any) => p.available && p.stock > p.reserved)
          .map((p: any) => `${p.name} ₹${p.price / 100}/${p.unit}`)
          .join(", ");
        const announcement = `Vanakkam ${r.name}! Our estimated arrival is ${r.arrival} (${r.days}). Route status: ${label(r.status)}. Available today: ${stock}. Please message me privately with quantities to reserve. Availability is confirmed when booked.`;
        return (
          <section className="card route-card" key={r.id}>
            <div className="route-card-top">
              <span className="route-symbol">
                <Route size={30} />
              </span>
              <Badge>{label(r.status)}</Badge>
            </div>
            <div className="eyebrow">STOP 0{i + 1}</div>
            <h2>{r.name}</h2>
            <p>
              <Clock size={16} /> {r.arrival}
            </p>
            <p>{r.days}</p>
            <div className="route-metrics">
              <div>
                <strong>{r.customers}</strong>
                <small>Customers</small>
              </div>
              <div>
                <strong>
                  {d.demand.filter((x: any) => x.street === r.name).length}
                </strong>
                <small>Products reserved</small>
              </div>
            </div>
            {edit === r.id ? (
              <form
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  if (
                    await act({
                      action: "route",
                      id: r.id,
                      ...Object.fromEntries(new FormData(ev.currentTarget)),
                    })
                  )
                    setEdit("");
                }}
              >
                <label>
                  Route name
                  <input name="name" defaultValue={r.name} required />
                </label>
                <label>
                  Visiting days
                  <input name="days" defaultValue={r.days} required />
                </label>
                <label>
                  Arrival window
                  <input name="arrival" defaultValue={r.arrival} required />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={r.status}>
                    {["SCHEDULED", "ON_THE_WAY", "COMPLETED", "CANCELLED"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                <button>Save route</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEdit("")}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button className="secondary full" onClick={() => setEdit(r.id)}>
                Edit schedule
              </button>
            )}
            <div className="announcement">
              <strong>
                <MessageCircle size={16} />
                Ready for your WhatsApp group
              </strong>
              <p>{announcement}</p>
              <button
                className="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(announcement);
                    notify(
                      "Announcement copied. Post it manually in your group.",
                    );
                  } catch {
                    notify(
                      "Clipboard unavailable. Select and copy the announcement text.",
                    );
                  }
                }}
              >
                <Copy size={15} />
                Copy announcement
              </button>
            </div>
            <small>
              Manual group posting. Orders happen in private 1:1 chats.
            </small>
          </section>
        );
      })}
    </div>
  );
}
function Playground({
  d,
  act,
  refresh,
  notify,
  fail,
}: {
  d: any;
  act: (a: any) => Promise<any>;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  fail: (s: string) => void;
}) {
  const [customer, setCustomer] = useState("c0"),
    [text, setText] = useState(""),
    [view, setView] = useState("customer"),
    [sending, setSending] = useState(false),
    [recording, setRecording] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("checkout");
    const selected = d.orders.find((o: any) => o.id === id);
    if (selected) setCustomer(selected.customer_id);
  }, [d.orders]);
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const messages = d.messages.filter((m: any) => m.customer_id === customer);
  const orders = d.orders.filter((o: any) => o.customer_id === customer);
  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    if (
      await act({
        action: "message",
        customerId: customer,
        messageId: crypto.randomUUID(),
        text,
      })
    )
      setText("");
    setSending(false);
  }
  async function upload(file: File) {
    try {
      setSending(true);
      const body = new FormData();
      body.set("file", file);
      const r = await fetch("/api/media", { method: "POST", body });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setText(j.text);
      notify(j.notice);
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function voice() {
    try {
      if (recording) {
        recorder.current?.stop();
        setRecording(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        upload(new File(chunks, "voice.webm", { type: rec.mimeType }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      fail(
        "Microphone access is unavailable. You can upload an audio recording instead.",
      );
    }
  }
  return (
    <>
      <div className="playground-toolbar">
        <div className="tabs">
          <button
            className={view === "customer" ? "selected" : ""}
            onClick={() => setView("customer")}
          >
            Customer view
          </button>
          <button
            className={view === "vendor" ? "selected" : ""}
            onClick={() => setView("vendor")}
          >
            Vendor view
          </button>
        </div>
        <label>
          Demo customer
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            {d.customers.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => refresh().catch((e) => fail(e.message))}
        >
          Refresh status
        </button>
      </div>
      {view === "vendor" ? (
        <Orders d={{ ...d, orders }} act={act} />
      ) : (
        <div className="playground-grid">
          <section className="chat">
            <div className="chat-header">
              <div className="avatar">
                <ShoppingBasket />
              </div>
              <div>
                <strong>Selvam anna · NammaVandi</strong>
                <small>
                  <span />
                  Your trusted neighbourhood vendor
                </small>
              </div>
              <Badge>Simulator</Badge>
            </div>
            <div className="chat-body">
              <div className="chat-date">TODAY · DEMO CONVERSATION</div>
              <div className="bubble incoming">
                Vanakkam! Tell me what you need. I’ll check today’s stock and
                prices. You review the cart before anything is reserved.
                <small>English · தமிழ் · Tanglish</small>
              </div>
              {messages.map((m: any) => {
                const r = JSON.parse(m.response);
                return (
                  <div key={m.id}>
                    <div className="bubble outgoing">
                      {m.text}
                      <small>
                        Sent <Check size={12} />
                      </small>
                    </div>
                    <div className="bubble incoming">
                      {r.reply}
                      {r.orderId && (
                        <small>
                          Cart #{r.orderId.slice(0, 8)} · review alongside
                        </small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="quick-prompts">
              {[
                "ara kilo vendakkai, rendu kattu arai keerai",
                "அரை கிலோ வெண்டைக்காய், இரண்டு கட்டு அரைக்கீரை",
                "naalaiku murungakkai 1 kg vangitu vaanga",
                "When will you arrive?",
              ].map((s, i) => (
                <button key={s} onClick={() => setText(s)}>
                  {
                    [
                      "₹65 sample cart",
                      "Try Tamil",
                      "Market request",
                      "Arrival window",
                    ][i]
                  }
                </button>
              ))}
            </div>
            <form className="chat-input" onSubmit={send}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,audio/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="ghost"
                aria-label="Upload image or voice note"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={21} />
              </button>
              <input
                aria-label="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your shopping list…"
              />
              <button
                type="button"
                className={"ghost " + (recording ? "danger" : "")}
                aria-label={recording ? "Stop recording" : "Record voice note"}
                onClick={voice}
              >
                <Mic size={21} />
                {recording ? "Stop" : ""}
              </button>
              <button disabled={sending} aria-label="Send message">
                <Send size={19} />
              </button>
            </form>
            <div className="chat-disclosure">
              {recording
                ? "Recording… press Stop when finished."
                : "Text uses a deterministic parser. Mock media results are labelled and editable."}
            </div>
          </section>
          <section className="cart-panel">
            <div className="section-title">
              <div>
                <h2>Your order, with clarity</h2>
                <p>Review → reserve → pay → receive</p>
              </div>
              <ShoppingBasket size={24} />
            </div>
            <div className="info-strip">
              <ShieldCheck size={18} />
              Only vendor-confirmed prices. Nothing is reserved until you
              confirm.
            </div>
            {orders.length ? (
              orders.map((o: any) => (
                <OrderCard
                  key={o.id + o.status + o.payment_status}
                  o={o}
                  act={act}
                  customer
                  mode={d.paymentMode}
                />
              ))
            ) : (
              <div className="card empty">
                <ShoppingBasket size={40} />
                <h3>Your basket is waiting</h3>
                <p>Send a shopping list, or try the ₹65 sample cart.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
