CREATE TABLE IF NOT EXISTS customers (id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(180) UNIQUE NOT NULL, address TEXT);
CREATE TABLE IF NOT EXISTS categories (id BIGSERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS products (id BIGSERIAL PRIMARY KEY, sku VARCHAR(60) UNIQUE NOT NULL, name VARCHAR(160) NOT NULL, category_id BIGINT REFERENCES categories(id), price NUMERIC(12,2) NOT NULL CHECK(price>=0));
CREATE TABLE IF NOT EXISTS warehouses (id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, location VARCHAR(180));
CREATE TABLE IF NOT EXISTS inventory (product_id BIGINT REFERENCES products(id), warehouse_id BIGINT REFERENCES warehouses(id), quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), PRIMARY KEY(product_id,warehouse_id));
CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id), status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','SHIPPED','CANCELLED')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(total>=0));
CREATE TABLE IF NOT EXISTS order_items (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id BIGINT NOT NULL REFERENCES products(id), warehouse_id BIGINT NOT NULL REFERENCES warehouses(id), quantity INTEGER NOT NULL CHECK(quantity>0), unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price>=0));
CREATE TABLE IF NOT EXISTS payments (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id), amount NUMERIC(12,2) NOT NULL CHECK(amount>=0), status VARCHAR(30) NOT NULL DEFAULT 'PENDING', paid_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS shipments (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id), tracking_number VARCHAR(100) UNIQUE, status VARCHAR(30) NOT NULL DEFAULT 'PENDING', shipped_at TIMESTAMPTZ);

-- Phase 5: additive migrations; safe for existing Phase 4 databases.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier VARCHAR(80);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS estimated_delivery DATE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill Phase 4 order history into dedicated payment and shipment records.
INSERT INTO payments(order_id, amount, status, paid_at)
SELECT o.id, o.total, CASE WHEN o.status = 'PAID' OR o.status = 'SHIPPED' THEN 'PAID' WHEN o.status = 'CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END,
       CASE WHEN o.status = 'PAID' OR o.status = 'SHIPPED' THEN o.created_at ELSE NULL END
FROM orders o ON CONFLICT (order_id) DO NOTHING;
INSERT INTO shipments(order_id, status, shipped_at)
SELECT o.id, CASE WHEN o.status = 'SHIPPED' THEN 'SHIPPED' WHEN o.status = 'CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END,
       CASE WHEN o.status = 'SHIPPED' THEN o.created_at ELSE NULL END
FROM orders o ON CONFLICT (order_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
INSERT INTO categories(name) VALUES ('Electronics'),('Office'),('Home') ON CONFLICT DO NOTHING;
INSERT INTO warehouses(name,location) SELECT 'Main Warehouse','San Jose, CA' WHERE NOT EXISTS(SELECT 1 FROM warehouses WHERE name='Main Warehouse');
INSERT INTO customers(name,email,address) VALUES ('Demo Customer','demo@example.com','San Jose') ON CONFLICT(email) DO NOTHING;
INSERT INTO products(sku,name,category_id,price) SELECT 'KB-001','Mechanical Keyboard',id,79.99 FROM categories WHERE name='Electronics' ON CONFLICT(sku) DO NOTHING;
INSERT INTO products(sku,name,category_id,price) SELECT 'MS-001','Wireless Mouse',id,29.99 FROM categories WHERE name='Electronics' ON CONFLICT(sku) DO NOTHING;
INSERT INTO inventory(product_id,warehouse_id,quantity) SELECT p.id,w.id,25 FROM products p CROSS JOIN warehouses w WHERE p.sku IN ('KB-001','MS-001') AND w.name='Main Warehouse' ON CONFLICT DO NOTHING;
