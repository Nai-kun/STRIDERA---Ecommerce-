# Traceability Matrix — STRIDERA Multi-Seller Revision

> Branch: `revision/multi-seller` | Status: **COMPLETE**

Maps every requirement from `requirements.md` (FR-01 to FR-17, NFR-01 to NFR-05) to the implementation file(s), test(s), and verification status.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented & verified |
| 🔶 | Partial / Could Have — implemented to extent in scope |
| ❌ | Not in scope (Won't Have) |

---

## Functional Requirements

| Req ID | Description | Implementation | Test Reference | Status |
|--------|-------------|----------------|----------------|--------|
| **FR-01.1** | Register with email + password | `auth.routes.js POST /register` | `security.test.js §1` | ✅ |
| **FR-01.2** | Login & receive JWT | `auth.routes.js POST /login` | `security.test.js §1` | ✅ |
| **FR-01.3** | Logout (clear cookie) | `auth.routes.js POST /logout` | Manual | ✅ |
| **FR-01.4** | Password reset via email | Stubbed (Could Have) | — | 🔶 |
| **FR-01.5** | View/edit profile | `auth.routes.js PUT /profile` | Manual | ✅ |
| **FR-01.6** | Manage saved addresses | `auth.routes.js POST/DELETE /addresses` | Manual | ✅ |
| **FR-01.7** | Order history | `order.routes.js GET /orders` | Manual | ✅ |
| **FR-01.8** | Session expiry | JWT exp in cookie | — | ✅ |
| **FR-01.9** | Guest checkout | `order.routes.js` optional auth | Manual | ✅ |
| **FR-02.1** | Homepage sections | `frontend/app/page.js` | Manual | ✅ |
| **FR-02.2** | Filterable shop page | `frontend/app/shop/page.js`, `product.routes.js` | Manual | ✅ |
| **FR-02.3** | Multi-axis filters | `product.routes.js` query builder | Manual | ✅ |
| **FR-02.4** | Sort options | `product.routes.js orderBy` | Manual | ✅ |
| **FR-02.5** | Pagination | `product.routes.js` skip/take | Manual | ✅ |
| **FR-02.6** | Shareable filter URLs | Frontend query params | Manual | ✅ |
| **FR-02.7** | Empty/loading states | Frontend components | Manual | ✅ |
| **FR-02.8** | Clear-all-filters | Frontend action | Manual | ✅ |
| **FR-02.9** | Mobile filter drawer | Frontend CSS | Manual | ✅ |
| **FR-02.10** | Product cards | `frontend/app/shop/page.js` | Manual | ✅ |
| **FR-03.1–12** | Product detail page | `frontend/app/products/[slug]/page.js` | Manual | ✅ |
| **FR-04.1–9** | Shopping cart | `frontend/app/cart/page.js`, `cart.routes.js` | `functional.test.js §2` | ✅ |
| **FR-05.1–10** | Checkout flow | `frontend/app/checkout/page.js`, `order.routes.js` | `functional.test.js §3` | ✅ |
| **FR-06.1** | Create PayMongo session | `payment.routes.js POST /create-session` | Manual | ✅ |
| **FR-06.2** | Redirect to provider | `frontend/app/checkout/page.js` | Manual | ✅ |
| **FR-06.3** | Receive webhook | `payment.routes.js POST /webhook` | `security.test.js §3` | ✅ |
| **FR-06.4** | Verify webhook signature | `payment.routes.js` HMAC-SHA256 | `security.test.js §3` | ✅ |
| **FR-06.5** | Idempotent processing | Webhook event dedup | `security.test.js §3` | ✅ |
| **FR-06.6** | Provider transaction record | `Payment` model | Manual | ✅ |
| **FR-06.7** | Handle all payment callbacks | `payment.routes.js` payment.failed/cancelled | Manual | ✅ |
| **FR-06.8** | PENDING → PAID/FAILED | `order.routes.js`, `payment.routes.js` | Manual | ✅ |
| **FR-06.9** | Never trust browser for PAID | Server-only webhook + simulate | `security.test.js §2` | ✅ |
| **FR-06.10** | Demo simulate fallback | `payment.routes.js POST /simulate` | `security.test.js §2` | ✅ |
| **FR-07.1** | Customer order list | `order.routes.js GET /orders` | Manual | ✅ |
| **FR-07.2** | Order detail | `order.routes.js GET /orders/:number` | Manual | ✅ |
| **FR-07.3** | Tracking display | `frontend/app/account/orders/page.js` | Manual | ✅ |
| **FR-07.4** | Status transitions audit-logged | `audit_logs` table entries | Manual | ✅ |
| **FR-08.1** | Per-variant stock tracking | `product_variants.stock_quantity` | `functional.test.js §5` | ✅ |
| **FR-08.2** | Atomic stock decrement on payment | Tx inside `payment.routes.js` webhook handler | `functional.test.js §5` | ✅ |
| **FR-08.3** | Stock restored on cancellation | `seller.routes.js PATCH /orders/:id/cancel` | `functional.test.js §5` | ✅ |
| **FR-08.4** | Stock movement audit | `stock_movements` table | Manual | ✅ |
| **FR-08.5** | Out-of-stock UI indicator | Frontend variant selector | Manual | ✅ |
| **FR-09.1** | Admin role protection | `auth.middleware.js isAdmin` | `security.test.js §1` | ✅ |
| **FR-09.2** | Product CRUD | `admin.routes.js` products | Manual | ✅ |
| **FR-09.3** | Category management | `admin.routes.js` categories | Manual | ✅ |
| **FR-09.4** | Image management | `product_images` via admin | Manual | ✅ |
| **FR-09.5** | Variant management | `admin.routes.js POST /products/:id/variants` | Manual | ✅ |
| **FR-09.6** | Inventory management | `admin.routes.js PATCH /variants/:id/stock` | `functional.test.js §5` | ✅ |
| **FR-09.7** | Order list with status filter | `admin.routes.js GET /orders` | Manual | ✅ |
| **FR-09.8** | Order detail with payment status | `admin.routes.js GET /orders` | Manual | ✅ |
| **FR-09.9** | Shipment status updates | `admin.routes.js PATCH /orders/:number/status` | Manual | ✅ |
| **FR-09.10** | Promo code management | `admin.routes.js /promotions` | Manual | ✅ |
| **FR-09.11** | Customer account list | `admin.routes.js GET /customers` | Manual | ✅ |
| **FR-09.12** | Sales reports | `admin.routes.js GET /reports/sales` | Manual | ✅ |
| **FR-09.13** | Admin audit logging | `auditLog` entries on mutations | Manual | ✅ |
| **FR-10.1** | Promo codes flat/percentage | `functional.test.js §2` | `functional.test.js §2` | ✅ |
| **FR-10.2** | Promo validation | `order.routes.js` promo validation | `functional.test.js §2` | ✅ |
| **FR-10.3** | Server-side promo application | `order.routes.js` only | `functional.test.js §2` | ✅ |
| **FR-10.4** | Admin promo management | `admin.routes.js /promotions` | Manual | ✅ |
| **FR-11.1** | Wishlist add/remove | `wishlist.routes.js` | Manual | ✅ |
| **FR-11.2** | Wishlist view | `wishlist.routes.js GET` | Manual | ✅ |
| **FR-11.3** | Quick add-to-cart from wishlist | Frontend | Manual | 🔶 |
| **FR-12.1** | Manual fulfillment | `admin.routes.js PATCH /orders/:number/status` | Manual | ✅ |
| **FR-12.2** | Configurable shipping fee | `order.routes.js` (env/config constant) | Manual | ✅ |
| **FR-12.3** | Shipment status updates | `order.routes.js`, `seller.routes.js` | Manual | ✅ |
| **FR-12.4** | Order confirmation email | Stubbed (Could Have) | — | 🔶 |
| **FR-12.5** | Shipment notification email | Stubbed (Could Have) | — | 🔶 |
| **FR-13.1** | Seller registration | `auth.routes.js POST /register-seller` | Manual | ✅ |
| **FR-13.2** | Seller status machine | `SellerStatus` enum + admin status update | `security.test.js §5` | ✅ |
| **FR-13.3** | Pending seller 403 | `auth.middleware.js requireSeller` | `security.test.js §5` | ✅ |
| **FR-13.4** | Admin seller review & approval | `admin.routes.js PATCH /sellers/:id/status` | Manual | ✅ |
| **FR-13.5** | Admin brand assignment | `admin.routes.js POST /sellers/:id/assign-brand` | Manual | ✅ |
| **FR-14.1** | Seller product CRUD | `seller.routes.js /products` | Manual | ✅ |
| **FR-14.2** | Tenant isolation (404 for alien) | `seller.routes.js` ownership check | `security.test.js §5` | ✅ |
| **FR-14.3** | Stock adjustment with reason + audit | `seller.routes.js PATCH /variants/:id/stock` | `functional.test.js §5` | ✅ |
| **FR-14.4** | No negative stock | Conditional update guard | `functional.test.js §5` | ✅ |
| **FR-15.1** | Atomic SellerOrder slicing | `order.routes.js` transaction | `functional.test.js §4` | ✅ |
| **FR-15.2** | Per-slice subtotal | `SellerOrder.subtotalCentavos` | `functional.test.js §4` | ✅ |
| **FR-15.3** | Centavos arithmetic invariant | Integer-only money math | `functional.test.js §1` | ✅ |
| **FR-15.4** | Payment propagates to slices | `payment.routes.js` webhook + simulate | Manual | ✅ |
| **FR-16.1** | Seller views own slices only | `seller.routes.js GET /orders` | `security.test.js §5` | ✅ |
| **FR-16.2** | Seller marks SHIPPED + tracking | `seller.routes.js PATCH /orders/:id/fulfill` | Manual | ✅ |
| **FR-16.3** | Seller cancels with reason | `seller.routes.js PATCH /orders/:id/cancel` | Manual | ✅ |
| **FR-16.4** | Cancel → stock restore | Atomic tx in cancel handler | `functional.test.js §5` | ✅ |
| **FR-17.1** | Brand directory + storefront | `frontend/app/brands/`, `brand.routes.js` | Manual | ✅ |
| **FR-17.2** | Brand filter in shop | `product.routes.js ?brand=slug`, `frontend/app/shop/page.js` | Manual | ✅ |
| **FR-17.3** | Admin brand management | `admin.routes.js /brands` | Manual | ✅ |

---

## Non-Functional Requirements

| Req ID | Description | Implementation | Status |
|--------|-------------|----------------|--------|
| **NFR-01** | Page load < 3s, lazy images, pagination | Next.js SSR/static, paginated APIs | ✅ |
| **NFR-02** | Password hashing, JWT httpOnly, CSRF, XSS, parameterized queries | bcrypt factor 12, cookie flags, Prisma ORM, Helmet | ✅ |
| **NFR-02** | Rate limiting | `loginLimiter` (10 req/15min) | ✅ |
| **NFR-02** | No secrets in client or logs | `config-status` masks secrets | ✅ |
| **NFR-02** | Audit logging for admin mutations | `auditLog` entries | ✅ |
| **NFR-03** | Maintainability: modular routes, Prisma schema | One file per domain | ✅ |
| **NFR-04** | Testability: isolated pure functions | `tests/functional.test.js`, `tests/security.test.js` | ✅ |
| **NFR-05** | Documented API and architecture | `contents/documentation/api.md`, diagrams, README | ✅ |
