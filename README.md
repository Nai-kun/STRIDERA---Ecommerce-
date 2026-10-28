# STRIDERA — Premium Filipino Footwear E-Commerce

A full-stack multi-seller e-commerce platform for STRIDERA footwear, built with Next.js + Node/Express + PostgreSQL.

> **Branch `revision/multi-seller`**: Implements the full multi-seller marketplace revision (Slices A–F) per IPT requirements.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Vanilla CSS |
| Backend | Node.js, Express 5, Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT (httpOnly cookies), bcrypt hashing |
| Payments | PayMongo sandbox (GCash, Maya, GrabPay) |
| Shipping | Manual fulfillment workflow (per-seller slice) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (local or hosted)
- (Optional) PayMongo sandbox account — app works in demo mode without it

### 1. Clone & Install

```bash
git clone https://github.com/Nai-kun/STRIDERA---Ecommerce-.git
cd STRIDERA---Ecommerce-

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cp .env.example backend/.env
# Edit backend/.env — minimum required fields:
#   DATABASE_URL   — PostgreSQL connection string
#   JWT_SECRET     — any long random string
#   DEMO_MODE=true — enables payment simulation fallback
```

### 3. Database Setup

```bash
cd backend

# Push Prisma schema to your DB (creates tables)
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed with sample products, brands, and demo accounts
node ../database/seeds/seed.js
```

> **Migration note (existing DB):** Apply `database/migrations/002_multi_seller.sql` first if you have an existing v1 schema before running `db push`.

### 4. Run Development Servers

```bash
# Terminal 1 — Backend API (port 4000)
cd backend && node server.js

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

Visit: **http://localhost:3000**

---

## Demo Credentials

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin | `admin@stridera.ph` | `Admin@Stridera2024!` | Full platform control |
| Approved Seller | `seller@stridera.ph` | `Seller@123!` | Active merchant (STRIDERA Lab brand) |
| Pending Seller | `pending.seller@stridera.ph` | `Seller@123!` | Awaiting approval — shows pending banner |
| Customer | `demo@stridera.ph` | `Customer@123!` | Regular shopper |

---

## Demo Runbook (Presenter Guide)

The following walkthrough demonstrates the complete multi-seller checkout flow using only seeded data and the demo payment fallback.

### 1. Browse & Add to Cart
- Open http://localhost:3000
- Go to **Shop** → filter by Brand "STRIDERA Lab"
- Add two different products (from different sellers if desired)
- Click **Cart** (top nav) to review the order

### 2. Checkout
- Click **Proceed to Checkout**
- Fill in shipping details (any address, e.g., *Manila, Metro Manila 1000*)
- Click **Place Order** → redirected to the Checkout page with order summary

### 3. Simulate Payment (Demo Mode)
- Click **⚡ Demo: Simulate Payment Success** on the checkout page
- Order immediately transitions to **PAID**; all seller slices also marked PAID

### 4. Seller Fulfillment
- Log in as `seller@stridera.ph` → **Merchant Hub**
- Navigate to **Orders** → find the slice in PAID status
- Enter tracking number and click **Mark as Shipped**

### 5. Admin Control Center
- Log in as `admin@stridera.ph` → **Admin Dashboard**
- Approve a pending seller: go to **Seller Applications** → Approve `pending.seller@stridera.ph`
- View masked Config Audit, Audit Logs, and Payment Logs

---

## Key Pages

| URL | Description |
|-----|-------------|
| `/` | Homepage with brand/category sections |
| `/shop` | Filterable catalog (supports `?brand=` query) |
| `/brands` | Brand directory |
| `/brands/[slug]` | Brand storefront |
| `/cart` | Shopping cart with promo code engine |
| `/checkout` | Checkout form + demo payment button |
| `/account/orders` | Customer order history |
| `/seller/dashboard` | Merchant hub |
| `/seller/products` | Seller product management |
| `/seller/orders` | Seller order slices |
| `/seller/register` | Seller onboarding form |
| `/admin/dashboard` | Admin control center |

---

## Promo Codes

| Code | Discount |
|------|---------|
| `STRIDE10` | 10% off (max ₱500) |
| `LAUNCH500` | ₱500 off orders ₱3,000+ |

---

## API Reference

See [`contents/documentation/api.md`](contents/documentation/api.md) for the full endpoint reference including request/response shapes, auth requirements, and error codes.

Quick summary:

| Route Group | Mount | Auth |
|-------------|-------|------|
| Authentication | `/api/auth` | Public/JWT |
| Products & Brands | `/api/products`, `/api/brands` | Public |
| Cart | `/api/cart` | Session/JWT |
| Orders | `/api/orders` | Optional auth (guest OK) |
| Payments | `/api/payments` | JWT / Webhook |
| Seller Portal | `/api/seller` | Approved Seller |
| Admin | `/api/admin` | Admin only |
| Wishlist | `/api/wishlist` | Authenticated |

---

## Migration Guide (v1 → v2 Multi-Seller)

If upgrading an existing single-seller v1 database:

1. Apply `database/migrations/002_multi_seller.sql` (additive — no destructive changes)
2. Run `npx prisma generate` to update the Prisma client
3. Run `node database/seeds/seed.js` to add brands and seller accounts (existing data is preserved)
4. All pre-existing products will have `seller_id = NULL` and `brand_id = NULL` — they remain visible on the storefront

---

## Directory Structure

```
STRIDERA/
├── source/                    # READ-ONLY supplied assets (PDFs, original DFDs)
├── contents/
│   ├── documentation/
│   │   ├── requirements.md    # Full functional + NFR spec (FR-01 to FR-17)
│   │   ├── api.md             # API reference (v2)
│   │   ├── design-system.md   # Visual design tokens
│   │   └── ...
│   └── diagrams/
│       ├── erd.mmd            # Entity-relationship diagram (multi-seller)
│       ├── dfd-level-0.mmd    # Context diagram
│       ├── dfd-level-1.mmd    # Main processes
│       ├── dfd-level-2-checkout.mmd
│       ├── dfd-level-2-fulfillment.mmd
│       └── dfd-level-2-inventory.mmd
├── frontend/                  # Next.js 14 app (App Router)
│   └── app/
│       ├── seller/            # Merchant hub pages
│       ├── admin/             # Admin dashboard
│       ├── brands/            # Brand directory + storefront
│       └── ...
├── backend/
│   ├── prisma/schema.prisma   # Prisma schema (multi-seller models)
│   └── src/
│       ├── middleware/        # auth.middleware.js (requireSeller, isSeller, etc.)
│       └── routes/            # auth, brand, product, cart, order, payment, seller, admin, wishlist
├── database/
│   ├── migrations/            # 001_initial.sql, 002_multi_seller.sql
│   └── seeds/seed.js
└── tests/
    ├── functional.test.js     # 12 unit tests (money, promo, slicing, stock)
    └── security.test.js       # 16 unit tests (auth, webhooks, tenant isolation)
```

---

## Security Notes

- Passwords hashed with bcrypt (work factor 12)
- JWT in httpOnly, sameSite cookies (not localStorage)
- All prices and stock validated server-side — client totals are never trusted
- Payment status set **only** via HMAC-verified PayMongo webhook or admin-gated demo simulate
- Tenant isolation: cross-seller lookups return `404` (not `403`) to preserve confidentiality
- Secrets are never stored in the database or rendered in API responses; `config-status` returns masked previews
- Rate limiting on auth endpoints (10 attempts / 15 min)
- Audit logs for all admin and seller mutations

---

## Sandbox Payments

This app uses PayMongo sandbox. **No real money is charged.**

Configure `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` in `backend/.env`.

Without keys, the app falls back to demo mode — use the **⚡ Simulate Payment** button (requires `DEMO_MODE=true` and admin login).

---

## Tests

```bash
# Run all unit tests
node --test tests/functional.test.js  # 12 tests — money, promo, slicing, stock
node --test tests/security.test.js    # 16 tests — auth, webhooks, tenant isolation
```

All 28 tests pass on `revision/multi-seller`.
