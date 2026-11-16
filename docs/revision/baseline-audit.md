# STRIDERA Revision — Phase 0 Baseline Audit

**Audit Date:** 2026-11-16  
**Baseline Stack:** Next.js 16 (App Router) frontend (`frontend/`), Node.js + Express 5 backend (`backend/`), Prisma ORM 7 + embedded PGlite PostgreSQL (`backend/db-server.js`).  
**Baseline Test Run:** `node --test tests/functional.test.js tests/security.test.js` — **26/26 tests passed** (12 suites).  
**Database Backup:** `backups/stridera-db_20261116_180346`

## Existing Documentation Layout
The repository uses `contents/documentation/` for earlier project docs, `source/DFD/` for earlier Mermaid diagrams, and `database/migrations/` for SQL migrations. Revision artifacts are placed in `docs/revision/` to keep the revision audit cleanly separated while keeping `contents/` intact.

## Revision Item Audit (REV-01 through REV-15)

| ID | Revision Item | Status | Existing Files & Findings |
|---|---|---|---|
| **REV-01** | Multi-seller marketplace; every product belongs to a seller | **Present** | `backend/prisma/schema.prisma` (`Product.sellerId`), `backend/src/routes/product.routes.js`, `frontend/app/shop/page.js`. Needs explicit "Sold by {storeName}" badge consistency (D14) and suspended-seller product hiding. |
| **REV-02** | Persistent authentication for all roles; user returns to their own UI | **Partial** | `backend/src/middleware/auth.middleware.js` uses JWT in `token` cookie + `localStorage`. Missing `session_token` hash column on `User`, missing `last_seen_at` / `last_login_at`, missing session invalidation on password/role/status change, and missing "Keep me signed in" toggle. |
| **REV-03** | Seller role and portal | **Present** | `backend/src/routes/seller.routes.js`, `frontend/app/seller/dashboard/page.js`, `frontend/app/seller/register/page.js`. Missing dedicated "Awaiting Approval" screen when `PENDING` seller logs in. |
| **REV-04** | FR-4.1 Product catalog management (add, edit, archive, images, variants) | **Partial** | `seller.routes.js` has product/variant CRUD & archive. `frontend/app/seller/products/page.js` needs Edit modal, Archive/Restore toggle, and secure image upload (PNG/JPG/WEBP <= 2MB, magic-byte validation). |
| **REV-05** | FR-4.2 Stock tracking: real-time decrement on payment, manual adjustment | **Partial** | Currently `order.routes.js` decrements stock at order *creation*, not payment confirmation. Needs `finalizePayment()` transactional service (D9) with `stock_conflict` handling and idempotent webhook/simulate paths. |
| **REV-06** | FR-4.3 Merchant order overview & fulfilment | **Partial** | `seller.routes.js` & `frontend/app/seller/orders/page.js` have `SellerOrder` slices. Needs canonical filter chips (`PENDING`, `PAID`, `SHIPPED`, `CANCELLED`), D2 derived order status ("Partially shipped"), and `stock_conflict` shipping block. |
| **REV-07** | FR-4.4 Product metrics: high-selling vs low-selling | **Missing** | `/api/seller/dashboard` only returns aggregate revenue/orders. Missing per-product/variant metrics, period selector (7/30/90/all), High-selling / Low-selling / No sales classification (D8), and lightweight chart. |
| **REV-08** | FR-5.1 Admin analytics for all sellers | **Missing** | `/api/admin/reports` has basic platform totals. Missing per-seller performance table (revenue, units, orders, active listings, low-stock, fulfilment rate, `last_seen_at`, "Online now" badge), period selector, and chart. |
| **REV-09** | Admin approves sellers; manages user roles & permissions | **Partial** | `admin.routes.js` has seller approval and role/status endpoints. Missing D6 safeguards: prevent demoting/suspending last admin and prevent self-lockout. |
| **REV-10** | Admin configures API keys; monitors webhooks & health logs | **Partial** | `/api/admin/config-status` only reads `.env`. Missing `system_settings` encrypted storage with masked display & live-key rejection, `webhook_events` table & monitor, and real `/api/admin/health` checks. |
| **REV-11** | Original admin duties stay (orders UNPAID/PAID, mock inventory) | **Present** | `admin.routes.js` & `frontend/app/admin/dashboard/page.js` have orders & product/inventory management. |
| **REV-12** | Authorization checks for seller store operations | **Present** | `requireSeller` returns `404` for non-sellers; `seller.routes.js` scopes queries by `sellerId: req.user.id`. Needs `getOwnedProductOr404` helper consistency. |
| **REV-13** | Proposed data model + additive columns | **Partial** | `schema.prisma` has core tables. Missing `session_token_hash`, `session_expires_at`, `last_login_at`, `last_seen_at`, `OrderItem.fulfillment_status`/`shipped_at`/`stock_conflict`, `Order.stock_decremented`, `system_settings`, `webhook_events`. |
| **REV-14** | Sellers work independently once approved | **Present** | Approved sellers create/edit/archive products and fulfill orders without admin approval per action. |
| **REV-15** | Unchanged requirements stay working (browse, cart, e-wallet, Simulate fallback) | **Present** | Working end-to-end; will be verified with regression tests. |

## Beyond-Spec Functionality Found (Phase 0 Step 3)
Earlier drafts (`SKILL UPDATE.md` / `003_seven_roles_and_enterprise_portals.sql`) introduced 4 extra staff roles beyond the 3 roles (Shopper, Seller, Administrator) in the revised spec:
- `INVENTORY_MANAGER` (`/inventory`, `backend/src/routes/inventory.routes.js`)
- `DELIVERY_PERSONNEL` (`/delivery`, `backend/src/routes/delivery.routes.js`)
- `CUSTOMER_SUPPORT` (`/support`, `backend/src/routes/support.routes.js`)
- `FINANCE_OFFICER` (`/finance`, `backend/src/routes/finance.routes.js`)

Per Phase 0 Step 3: these working routes and pages are **preserved untouched**, marked **beyond-spec** in `assumptions-and-gaps.md`, not extended, and no new revision features depend on them.

## New Product Images Discovered
13 new footwear images were added to `source/product_images/pcs/` (`fomalmen1..2`, `formalmen3..5`, `formalwomen1..5`, `loafermen1..3`). These have been copied to `frontend/public/assets/products/` as `formal-men-1..5.jpg`, `formal-women-1..5.jpg`, and `loafer-men-1..3.jpg` and will be wired into `database/seeds/seed.js`.
