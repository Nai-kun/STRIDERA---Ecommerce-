-- 008: Holiday-Aware Delivery Schedule Fields (Additive & Idempotent)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_delivery_start" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_delivery_end" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_zone" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_schedule_source" TEXT NOT NULL DEFAULT 'UNAVAILABLE';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_holidays_observed" JSONB;
