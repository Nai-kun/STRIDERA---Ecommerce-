-- 006: PSGC Philippine Address API Verification & Hierarchy Fields (Additive & Idempotent)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_region" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_barangay" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_region_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_province_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_city_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_barangay_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_address_source" TEXT NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "barangay" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "region_code" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "province_code" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "city_code" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "barangay_code" TEXT;
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "address_source" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE INDEX IF NOT EXISTS "orders_shipping_city_code_idx" ON "orders"("shipping_city_code");
CREATE INDEX IF NOT EXISTS "addresses_city_code_idx" ON "addresses"("city_code");
