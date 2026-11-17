-- Match the lookup paths used by the order engine and route demand summaries.
CREATE INDEX IF NOT EXISTS orders_route_status ON orders(route_id,status,visit);
CREATE INDEX IF NOT EXISTS inventory_day ON daily_inventory(day,available);
CREATE INDEX IF NOT EXISTS requests_order_product ON special_requests(order_id,product_id,status);
CREATE INDEX IF NOT EXISTS payments_link ON payments(link_id);
CREATE INDEX IF NOT EXISTS messages_order ON messages(json_extract(response,'$.orderId'));
CREATE INDEX IF NOT EXISTS customers_street ON customers(street_id);
