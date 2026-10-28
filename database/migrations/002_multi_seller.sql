-- ============================================================
-- Migration 002: Multi-Seller Support
-- STRIDERA E-Commerce — revision/multi-seller branch
-- Additive and reversible. Run on a copy of the DB first.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────
-- 1. Extend UserRole enum with SELLER
-- ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SELLER' AND enumtypid = '"UserRole"'::regtype) THEN
    ALTER TYPE "UserRole" ADD VALUE 'SELLER';
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Add seller-specific columns to users table
-- ────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_status VARCHAR(20) DEFAULT NULL;
  -- Values: NULL (not a seller), PENDING, APPROVED, REJECTED, SUSPENDED
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_description TEXT DEFAULT NULL;

COMMENT ON COLUMN users.seller_status IS 'Seller approval status: NULL|PENDING|APPROVED|REJECTED|SUSPENDED';
COMMENT ON COLUMN users.store_name IS 'Seller store display name';

-- ────────────────────────────────────────────────
-- 3. Create brands table
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brands_name UNIQUE (name),
  CONSTRAINT uq_brands_slug UNIQUE (slug),
  CONSTRAINT uq_brands_seller_id UNIQUE (seller_id)
);

CREATE INDEX IF NOT EXISTS idx_brands_seller_id ON brands(seller_id);

COMMENT ON TABLE brands IS 'Seller brands — one approved seller gets one brand';

-- ────────────────────────────────────────────────
-- 4. Add seller/brand ownership columns to products
-- ────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);

COMMENT ON COLUMN products.seller_id IS 'NULL = platform-owned product; UUID = seller-owned';
COMMENT ON COLUMN products.brand_id IS 'Brand association (nullable for platform products)';

-- ────────────────────────────────────────────────
-- 5. Create seller_orders table (per-seller order slices)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id),
  subtotal_centavos INT NOT NULL CHECK (subtotal_centavos >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  tracking_number VARCHAR(255),
  tracking_url VARCHAR(500),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_orders_order_id ON seller_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_seller_id ON seller_orders(seller_id);

COMMENT ON TABLE seller_orders IS 'Order slices per seller. One parent order may have N seller_orders.';

-- ────────────────────────────────────────────────
-- 6. Add seller_order_id FK to order_items
-- ────────────────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_order_id UUID REFERENCES seller_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_seller_order_id ON order_items(seller_order_id);

-- ────────────────────────────────────────────────
-- 7. Backfill: existing rows remain valid
--    - users: seller_status stays NULL (they are not sellers)
--    - products: seller_id and brand_id stay NULL (platform-owned)
--    - order_items: seller_order_id stays NULL (pre-revision orders)
-- No destructive changes. All new columns are nullable.
-- ────────────────────────────────────────────────

COMMIT;

