# STRIDERA — Full Requirements Specification (`source/IPT.pdf` Alignment)

## 1. System Overview & 7 User Roles
STRIDERA is a multi-seller footwear e-commerce marketplace and enterprise operations platform supporting **7 distinct user roles** with Role-Based Access Control (RBAC):

| Role # | Enum Value | Persona | Primary Portal Route | Demo Credentials (`Password123!`) |
| :--- | :--- | :--- | :--- | :--- |
| **Role 1** | `CUSTOMER` | Shopper / Buyer | `/`, `/shop`, `/checkout`, `/account/profile` | `customer@stridera.ph` |
| **Role 2** | `SELLER` | Merchant / Brand Partner | `/seller/dashboard`, `/seller/products`, `/seller/orders` | `seller@stridera.ph` / `solecraft@stridera.ph` |
| **Role 3** | `ADMIN` | Platform Administrator / Presenter | `/admin/dashboard` | `admin@stridera.ph` |
| **Role 4** | `INVENTORY_MANAGER` | Warehouse & Inventory Manager | `/inventory` | `inventory@stridera.ph` |
| **Role 5** | `DELIVERY_PERSONNEL` | Courier / Delivery Personnel | `/delivery` | `delivery@stridera.ph` |
| **Role 6** | `CUSTOMER_SUPPORT` | Customer Support Personnel | `/support` | `support@stridera.ph` |
| **Role 7** | `FINANCE_OFFICER` | Treasury & Finance Officer | `/finance` | `finance@stridera.ph` |

---

## 2. Functional Requirements (`FR-1.1` – `FR-10.10`)

### Feature 1: User Account & Role-Based Authentication (`FR-1.1` – `FR-1.10`)
- **`FR-1.1`**: Customer registration with email, password, name, and phone.
- **`FR-1.2`**: Seller registration with store name, description, logo, and business/DTI/TIN `identificationDetails` (`PENDING` approval status).
- **`FR-1.3`**: Unified login supporting all **7 roles** (`CUSTOMER`, `SELLER`, `ADMIN`, `INVENTORY_MANAGER`, `DELIVERY_PERSONNEL`, `CUSTOMER_SUPPORT`, `FINANCE_OFFICER`).
- **`FR-1.4`**: Password hashing with `bcrypt` and JWT session issuance (`httpOnly` cookie + `Bearer` token).
- **`FR-1.5`**: Role-based route & API middleware enforcement (`requireAuth`, `requireSeller`, `requireAdmin`, `requireInventoryManager`, `requireDelivery`, `requireSupport`, `requireFinance`).
- **`FR-1.6`**: Profile management (name, phone, avatar) via `PUT /api/auth/profile`.
- **`FR-1.7`**: Password update (`PUT /api/auth/password`) and password recovery (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`).
- **`FR-1.8`**: Multiple saved shipping addresses (`GET/POST/DELETE /api/auth/addresses`).
- **`FR-1.9`**: Account status enforcement (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`).
- **`FR-1.10`**: Secure logout clearing session tokens.

### Feature 2: Multi-Seller Product Catalog, Search & Reviews (`FR-2.1` – `FR-2.12`)
- **`FR-2.1` – `FR-2.7`**: Browse products across verified sellers; filter by category, brand, seller, size, color, and price range (`minPrice`, `maxPrice`); sort by newest, price ascending/descending, name; full-text search.
- **`FR-2.8` – `FR-2.10`**: Product detail page with seller verification badge, interactive color/size variant matrix, real-time SKU stock badge, and out-of-stock protection.
- **`FR-2.11` – `FR-2.12`**: Customer product reviews (`rating` 1–5) and seller ratings (`sellerRating` 1–5) via `POST /api/products/:slug/reviews`.

### Feature 3: Shopping Cart, Checkout & Multi-Seller Order Slicing (`FR-3.1` – `FR-3.12`)
- **`FR-3.1` – `FR-3.6`**: Multi-seller cart with variant SKU validation, quantity controls, subtotal, shipping fee (`₱150.00`, free ≥ `₱5,000.00`), and grand total in integer centavos (`PHP`).
- **`FR-3.7` – `FR-3.9`**: Atomic checkout (`POST /api/orders`) that slices a single customer order into per-seller `SellerOrder` records and atomically decrements `ProductVariant.stockQuantity`.
- **`FR-3.10` – `FR-3.12`**: Order detail tracking (`/account/orders/[orderNumber]`), customer receipt confirmation (`PATCH /api/orders/:orderNumber/confirm-receipt`), and pre-shipment order cancellation with automatic stock restoration (`PATCH /api/orders/:orderNumber/cancel`).

### Feature 4: E-Wallet Payment Processing (`FR-4.1` – `FR-4.12`)
- **`FR-4.1` – `FR-4.6`**: Multi-wallet payment selection (`GCash`, `Maya`, `PayPal`) via `POST /api/payments/create-session`, generating either a live PayMongo session or an interactive Sandbox QR & Reference session.
- **`FR-4.7` – `FR-4.12`**: Sandbox payment confirmation (`POST /api/payments/confirm-sandbox`), failure simulation & retry (`POST /api/payments/fail-sandbox`), HMAC-SHA256 webhook verification (`POST /api/payments/webhook`), idempotency key deduplication, and Admin demo fallback (`POST /api/payments/simulate`).

### Feature 5: Seller / Merchant Portal (`FR-5.1` – `FR-5.13`)
- **`FR-5.1` – `FR-5.9`**: Seller store profile editing (`PUT /api/seller/profile`), product & SKU variant CRUD (`POST/PUT/DELETE /api/seller/products`), and strict tenant isolation (`404` on cross-seller access).
- **`FR-5.10` – `FR-5.13`**: Order acceptance (`PATCH /api/seller/orders/:id/accept`), order fulfillment with courier & tracking number (`PATCH /api/seller/orders/:id/fulfill`) creating a `Shipment` record, slice cancellation (`PATCH /api/seller/orders/:id/cancel`), and earnings/commission/payout summary.

### Feature 6: Inventory Manager Portal (`FR-6.1` – `FR-6.11`)
- **`FR-6.1` – `FR-6.11`**: Warehouse KPI dashboard (`GET /api/inventory/dashboard`), SKU stock listing (`GET /api/inventory/variants`), incoming stock logging (`POST /api/inventory/incoming`), outgoing dispatch logging (`POST /api/inventory/outgoing`), manual cycle-count adjustment (`PATCH /api/inventory/variants/:id/adjust`), non-negative stock invariant (`stockQuantity >= 0`), availability toggle (`PATCH /api/inventory/variants/:id/availability`), movement audit log (`GET /api/inventory/movements`), and seller valuation report (`GET /api/inventory/report`).

### Feature 7: Delivery Personnel Portal (`FR-7.1` – `FR-7.11`)
- **`FR-7.1` – `FR-7.11`**: Shipment manifest (`GET /api/delivery/shipments`), customer recipient address & contact view, assignment acceptance (`PATCH /api/delivery/shipments/:id/accept`), seller package collection (`PATCH /api/delivery/shipments/:id/collect`), transit status updates (`IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`) with Proof of Delivery & recipient signature (`PATCH /api/delivery/shipments/:id/status`), and failed delivery / return-to-seller logging (`POST /api/delivery/shipments/:id/fail`).

### Feature 8: Customer Support Personnel Portal (`FR-8.1` – `FR-8.11`)
- **`FR-8.1` – `FR-8.11`**: Customer support ticket creation (`POST /api/support/tickets`), ticket queue (`GET /api/support/tickets`), order/payment/shipment diagnostic lookup (`GET /api/support/orders/lookup`), ticket messaging (`POST /api/support/tickets/:id/messages`), status transitions (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), cancellation/return approvals, and refund escalation (`refundStatus = APPROVED`) to the Finance Officer (`POST /api/support/tickets/:id/action`).

### Feature 9: Finance Officer Portal (`FR-9.1` – `FR-9.11`)
- **`FR-9.1` – `FR-9.11`**: Financial KPI dashboard (`GET /api/finance/dashboard`), e-wallet reference verification (`PATCH /api/finance/payments/:id/verify`), seller gross/commission/net calculation (`5%` platform fee), seller payout disbursement (`POST /api/finance/payouts`), approved customer refund processing (`POST /api/finance/refunds/:ticketId/process`), and executive financial summary report (`GET /api/finance/reports`).

### Feature 10: Administrator Portal (`FR-10.1` – `FR-10.10`)
- **`FR-10.1` – `FR-10.10`**: Executive KPIs (`GET /api/admin/reports`), 7-role user management (`GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/status`), seller verification & brand assignment (`PATCH /api/admin/sellers/:id/status`, `PATCH /api/admin/sellers/:id/brand`), platform configuration (`GET/PUT /api/admin/platform-config`), read-only API secret audit (`GET /api/admin/config-status`), and immutable audit trail (`GET /api/admin/audit-logs`).

---

## 3. Non-Functional Requirements (`NFR-1` – `NFR-36`)
- **Performance (`NFR-1` – `NFR-5`)**: Indexed catalog queries, pagination, atomic DB transactions, and responsive Next.js App Router rendering.
- **Security (`NFR-6` – `NFR-12`)**: `bcrypt` password hashing (12 rounds), JWT validation, 7-role RBAC guards, seller tenant isolation (`404` for alien resources), rate limiting, Helmet headers, and read-only secret key masking.
- **Reliability & Data Integrity (`NFR-13` – `NFR-19`)**: Integer centavos currency storage (`PHP`), non-negative stock invariant (`stockQuantity >= 0`), idempotent payment webhook deduplication, and automatic stock restoration on cancellation.
- **Usability & Accessibility (`NFR-20` – `NFR-26`)**: High-contrast editorial footwear UI, 1-Click 7-Role Demo Switcher on `/account/login`, real-time stock indicators, interactive Sandbox E-Wallet QR modal, and mobile-first responsive layout.
- **Maintainability & Portability (`NFR-27` – `NFR-36`)**: Modular Express route architecture, Prisma ORM schema + SQL migrations, embedded zero-install PGlite PostgreSQL server (`db-server.js`), and automated Node test suite (`tests/functional.test.js`, `tests/security.test.js`).
