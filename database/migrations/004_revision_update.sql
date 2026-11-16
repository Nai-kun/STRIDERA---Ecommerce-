-- STRIDERA Revision Update Migration (004)
-- Additive & idempotent migration for REV-01 through REV-15

-- 1. Add FORMAL and LOAFERS to ShoeType enum if missing
DO $$ BEGIN
  ALTER TYPE "ShoeType" ADD VALUE IF NOT EXISTS 'FORMAL';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "ShoeType" ADD VALUE IF NOT EXISTS 'LOAFERS';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create ProductStatus and ItemFulfillmentStatus enums
DO $$ BEGIN
  CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ItemFulfillmentStatus" AS ENUM ('PENDING', 'SHIPPED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. User persistent session & activity columns (D3, D4)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_token_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_session_token_hash ON users(session_token_hash);

-- 4. Product status column (D11)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status "ProductStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE products SET status = 'ARCHIVED' WHERE is_active = false AND status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_products_seller_status ON products(seller_id, status);

-- 5. Order stock_decremented & OrderItem fulfillment columns (D2, D9)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT false;

UPDATE orders SET stock_decremented = true WHERE payment_status = 'PAID';

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS fulfillment_status "ItemFulfillmentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stock_conflict BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(product_variant_id);

-- 6. System Settings (Encrypted API keys & sandbox config, D7)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. Webhook Events Log (D7)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'paymongo',
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100),
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
  redacted_payload JSONB,
  error TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at);
