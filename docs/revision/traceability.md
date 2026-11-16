# STRIDERA Revision — Traceability Matrix

| Requirement ID | Requirement | PDF / Spec Source | Classification | Affected Pages, APIs, Tables | Status | Test IDs |
|---|---|---|---|---|---|---|
| **REV-01** | Multi-seller marketplace; every product belongs to a seller | Section A; F | Source-defined | `products` (`seller_id`), `GET /api/products`, `/shop`, `/products/[slug]` | Implemented | T-CAT-01, T-CAT-02 |
| **REV-02** | Persistent authentication for all roles; role-aware landing | A; B.1–B.3; D4 | Source-defined | `users` (`session_token_hash`, `session_expires_at`), `auth.middleware.js`, `/api/auth/*`, `/account/login` | Implemented | T-AUTH-01 to T-AUTH-05 |
| **REV-03** | Seller role, self-registration, awaiting-approval screen, portal | B.3; D5 | Source-defined | `/seller/register`, `/seller/dashboard`, `POST /api/auth/register-seller` | Implemented | T-AUTH-05, T-ADM-01 |
| **REV-04** | Seller product catalog management (add, edit, archive/restore, variants, images) | C Feature 4; D11; D12 | Source-defined | `/seller/products`, `POST/PUT/DELETE/PATCH /api/seller/products*`, `imageUpload.js`, `product_images` | Implemented | T-CAT-01 to T-CAT-04, T-SEC-04 |
| **REV-05** | Transactional, idempotent stock decrement on payment confirmation | C Feature 4; D9 | Inferred | `paymentFinalizer.js`, `order.routes.js`, `payment.routes.js`, `orders.stock_decremented`, `order_items.stock_conflict` | Implemented | T-PAY-01 to T-PAY-04 |
| **REV-06** | Seller order overview filtered by PENDING/PAID/SHIPPED/CANCELLED; fulfilment | C Feature 4; D1; D2 | Conflicting / Missing | `/seller/orders`, `seller.routes.js`, `order_items.fulfillment_status` | Implemented | T-ORD-01 to T-ORD-04 |
| **REV-07** | Seller product metrics: High-selling / Low-selling / No sales | C Feature 4; D8 | Inferred | `GET /api/seller/metrics`, `/seller/dashboard` | Implemented | T-MET-01 to T-MET-04 |
| **REV-08** | Admin platform-wide seller analytics & Online now activity | C Feature 5; D3; D8 | Inferred | `GET /api/admin/analytics`, `/admin/dashboard` (Analytics tab), `users.last_seen_at` | Implemented | T-MET-05, T-ADM-05 |
| **REV-09** | Admin seller approvals & role/status safeguards | B.2; D6 | Recommended | `PATCH /api/admin/sellers/:id/status`, `PATCH /api/admin/users/:id/*`, `audit_logs` | Implemented | T-ADM-01, T-ADM-02 |
| **REV-10** | Admin encrypted API keys, webhook monitor & health logs | B.2; D7 | Inferred | `cryptoSettings.js`, `system_settings`, `webhook_events`, `GET/PUT /api/admin/api-settings`, `GET /api/admin/webhooks`, `GET /api/admin/health` | Implemented | T-ADM-03, T-ADM-04, T-PAY-05 |
| **REV-11** | Original admin duties stay (view orders UNPAID/PAID, inventory) | B.2; E.2 | Source-defined | `/admin/dashboard`, `GET /api/admin/orders`, `/api/admin/products` | Implemented | T-RBAC-05 |
| **REV-12** | Server-side role & tenant isolation (404 for alien seller resources) | C NFR; D10 | Source-defined | `auth.middleware.js`, `seller.routes.js` | Implemented | T-RBAC-01 to T-RBAC-04 |
| **REV-13** | Proposed data model + additive columns & migrations | F; Phase 3 | Source-defined / Additive | `backend/prisma/schema.prisma`, `database/migrations/004_revision_update.sql` | Implemented | T-REG-01 |
| **REV-14** | Sellers work independently once approved | D | Source-defined | `seller.routes.js`, `/seller/*` | Implemented | T-CAT-01, T-ORD-02 |
| **REV-15** | Unchanged requirements stay working (browse, cart, e-wallet, Simulate fallback) | C; E; D13 | Source-defined | `/shop`, `/products/[slug]`, `/cart`, `/checkout`, `POST /api/payments/simulate` | Implemented | T-REG-01 to T-REG-03, T-ADM-06 |
