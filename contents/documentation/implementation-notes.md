# STRIDERA E-Commerce — Implementation Notes

## 1. System Architecture & Component Mapping

The STRIDERA platform is architected around a modern decoupled client-server model:

- **Presentation Layer**: Next.js 14 (App Router) with React Server and Client Components, styling with responsive CSS variables tokens defined in `globals.css` and `design-system.md`.
- **API & Controller Layer**: Express 4 running on Node.js with route modularity:
  - `auth.routes.js`: Session management, bcrypt password hashing, JWT cookies.
  - `product.routes.js`: Catalog queries, server-side dynamic filtering, slug lookups.
  - `category.routes.js`: Category hierarchy and navigation endpoints.
  - `cart.routes.js`: Persistent session/user cart sync, variant stock boundary enforcement.
  - `order.routes.js`: Multi-step checkout payload validation, immutable snapshot creation.
  - `payment.routes.js`: PayMongo checkout session creation, webhook signature verification (`Paymongo-Signature`), idempotent processing, and demo simulation fallback.
  - `admin.routes.js`: Role-protected metrics, inventory replenishment, and shipment management.
  - `wishlist.routes.js`: User-specific product wishlist toggling.
- **Data Access & Storage**: PostgreSQL 14+ via Prisma ORM Client, accompanied by raw SQL migration scripts in `database/migrations/`.

## 2. Inventory and Money Integrity Rules

- **Currency Minor Units**: All monetary values are handled strictly in integer centavos (e.g., ₱4,599.00 = `459900`). Floating-point arithmetic is strictly avoided to eliminate rounding drift across subtotals, tax, discounts, and payments.
- **Stock Decrement & Overselling Protection**:
  Variant inventory updates use atomic conditional updates (`UPDATE product_variants SET stock_quantity = stock_quantity - $qty WHERE id = $id AND stock_quantity >= $qty`) inside database transactions.
  Orders cannot be placed if requested quantities exceed real-time stock levels.
- **Order Price Snapshots**: Line item prices are snapshotted at time of checkout (`order_items.unit_price_centavos`) so future product price updates never alter historical financial records.

## 3. Payment Processing & Demo Safety Fallback

### PayMongo Flow
1. Client requests checkout session initiation via `POST /api/payments/checkout-session`.
2. Backend computes trusted server totals, creates pending `Order` record, and calls PayMongo API with line items and redirect URLs (`/checkout/success`, `/checkout/failed`).
3. Client redirects customer to PayMongo hosted payment page (supporting GCash, Maya, cards).
4. PayMongo emits asynchronous webhook event `payment.paid` to `/api/payments/webhook`.
5. Webhook signature is validated using `PAYMONGO_WEBHOOK_SECRET` before marking payment as `PAID` and transitioning order to `CONFIRMED`.

### Demo Safety Fallback (`DEMO_MODE=true`)
- When third-party sandbox sandboxes encounter connectivity or rate-limit issues, presenters can trigger `POST /api/payments/simulate-success`.
- **Guards**: Restricted strictly to environments where `process.env.DEMO_MODE === 'true'`, logs an `AuditLog` entry marked with `is_demo: true`, and verifies user permissions before changing order status.

## 4. Security & Compliance Measures

1. **Helmet & Cross-Origin Policy**: HTTP headers configured via Helmet to prevent clickjacking, MIME sniffing, and XSS.
2. **CORS Restrictions**: Whitelist limited to configured frontend URL with explicit credential allowances.
3. **Password Security**: Passwords hashed using bcrypt with work factor 12.
4. **Input Sanitization & Parameterization**: All database interactions use parameterized queries via Prisma, neutralizing SQL injection vectors.
5. **No Card Data Storage**: No credit card numbers, CVVs, or cardholder banking information ever traverse or reside within application databases.
