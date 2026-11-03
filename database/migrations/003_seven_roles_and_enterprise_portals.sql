-- ============================================================
-- Migration 003: Seven User Roles, Enterprise Portals & Multi-Seller Enhancements
-- Grounded in source/IPT.pdf (22-Page Authoritative Specification)
-- ============================================================

-- 1. Expand UserRole Enum to all 7 Roles (FR-1.3 & Section B)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INVENTORY_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DELIVERY_PERSONNEL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOMER_SUPPORT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE_OFFICER';

-- 2. AccountStatus Enum (FR-1.9 & FR-10.2)
DO $$ BEGIN
  CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Expand OrderStatus, SellerOrderStatus, ShippingStatus & ShipmentStatus Enums
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURN_REQUESTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED';

ALTER TYPE "SellerOrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "SellerOrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING';

ALTER TYPE "ShippingStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "ShippingStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "ShippingStatus" ADD VALUE IF NOT EXISTS 'RETURN_PENDING';

ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'COLLECTED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'RETURN_PENDING';

-- 4. Support & Finance Enums (Features 8 & 9)
DO $$ BEGIN
  CREATE TYPE "TicketCategory" AS ENUM ('INQUIRY', 'COMPLAINT', 'CANCELLATION', 'RETURN', 'REFUND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'SIMULATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Alter users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_logo_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS identification_details TEXT;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- 6. Alter orders & seller_orders & payments & stock_movements tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'gcash';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_confirmed_at TIMESTAMPTZ;

ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'gcash';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS finance_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS finance_verified_by VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS finance_verified_at TIMESTAMPTZ;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS movement_type VARCHAR(50) NOT NULL DEFAULT 'ADJUSTMENT';

-- 7. Alter shipments table (Feature 7: Delivery & Shipment Management)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS seller_order_id UUID REFERENCES seller_orders(id) ON DELETE SET NULL;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_personnel_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS proof_of_delivery_url VARCHAR(500);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '{"events":[]}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_shipments_delivery_personnel ON shipments(delivery_personnel_id);

-- 8. Create support_tickets & support_messages tables (Feature 8: Customer Support Management)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(30) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  seller_id UUID,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category "TicketCategory" NOT NULL DEFAULT 'INQUIRY',
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status "TicketStatus" NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  refund_amount_centavos INTEGER,
  refund_status "RefundStatus" NOT NULL DEFAULT 'NONE',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role VARCHAR(50) NOT NULL,
  sender_name VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

-- 9. Create seller_payouts table (Feature 9: Financial Management)
CREATE TABLE IF NOT EXISTS seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_number VARCHAR(30) UNIQUE NOT NULL,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gross_sales_centavos INTEGER NOT NULL,
  platform_fee_percent INTEGER NOT NULL DEFAULT 5,
  platform_fee_centavos INTEGER NOT NULL,
  net_amount_centavos INTEGER NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'gcash',
  reference_number VARCHAR(255) NOT NULL,
  status "PayoutStatus" NOT NULL DEFAULT 'COMPLETED',
  processed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller ON seller_payouts(seller_id);

-- 10. Create product_reviews table (Section B.1 & Process Flow 1)
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50),
  rating INTEGER NOT NULL DEFAULT 5,
  seller_rating INTEGER DEFAULT 5,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user ON product_reviews(user_id);

-- 11. Create platform_configs table (Feature 10: FR-10.9)
CREATE TABLE IF NOT EXISTS platform_configs (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  platform_fee_percent INTEGER NOT NULL DEFAULT 5,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  shipping_fee_centavos INTEGER NOT NULL DEFAULT 15000,
  free_shipping_threshold_centavos INTEGER NOT NULL DEFAULT 300000,
  enabled_wallets VARCHAR(255) NOT NULL DEFAULT 'gcash,maya,paypal',
  sandbox_mode BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
