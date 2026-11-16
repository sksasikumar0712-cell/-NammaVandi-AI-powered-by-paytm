import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const merchants = sqliteTable("merchants", {
  id: text().primaryKey(),
  name: text().notNull(),
});
export const streets = sqliteTable("streets", {
  id: text().primaryKey(),
  name: text().notNull(),
});
export const customers = sqliteTable("customers", {
  id: text().primaryKey(),
  name: text().notNull(),
  phone: text(),
  street_id: text().references(() => streets.id),
  opt_in: integer(),
});
export const routes = sqliteTable("routes", {
  id: text().primaryKey(),
  street_id: text().references(() => streets.id),
  name: text(),
  days: text(),
  arrival: text(),
  status: text(),
});
export const products = sqliteTable("products", {
  id: text().primaryKey(),
  merchant_id: text().references(() => merchants.id),
  name: text(),
  tamil: text(),
  aliases: text(),
  category: text(),
  unit: text(),
});
export const dailyInventory = sqliteTable("daily_inventory", {
  id: text().primaryKey(),
  product_id: text().references(() => products.id),
  day: text(),
  cost: integer(),
  price: integer(),
  stock: integer(),
  reserved: integer(),
  available: integer(),
});
export const orders = sqliteTable("orders", {
  id: text().primaryKey(),
  customer_id: text().references(() => customers.id),
  route_id: text().references(() => routes.id),
  visit: text(),
  status: text(),
  total: integer(),
  handoff: text(),
  created_at: text(),
  updated_at: text(),
});
export const orderItems = sqliteTable("order_items", {
  id: text().primaryKey(),
  order_id: text().references(() => orders.id),
  product_id: text().references(() => products.id),
  inventory_id: text().references(() => dailyInventory.id),
  quantity: integer(),
  price: integer(),
  amount: integer(),
});
export const specialRequests = sqliteTable("special_requests", {
  id: text().primaryKey(),
  order_id: text().references(() => orders.id),
  product_id: text().references(() => products.id),
  quantity: integer(),
  status: text(),
  price: integer(),
  minimum: integer(),
});
export const payments = sqliteTable("payments", {
  id: text().primaryKey(),
  order_id: text().references(() => orders.id),
  status: text(),
  amount: integer(),
  provider: text(),
  link_id: text(),
  url: text(),
  transaction_id: text(),
});
export const messages = sqliteTable("messages", {
  id: text().primaryKey(),
  customer_id: text().references(() => customers.id),
  text: text(),
  response: text(),
});
export const vendorPurchaseSummaries = sqliteTable(
  "vendor_purchase_summaries",
  { id: text().primaryKey(), day: text(), content: text() },
);
