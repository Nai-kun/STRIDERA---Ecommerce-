# STRIDERA Revision — API Routes Reference

| Method | Path | Allowed Roles | Key Request Fields | Response / Errors |
|---|---|---|---|---|
| POST | `/api/auth/login` | Public | `email`, `password`, `keepSignedIn` | Sets `stridera_session` + `token` cookies, returns `{ user, token }` / `401` |
| POST | `/api/auth/register` | Public | `email`, `password`, `firstName`, `lastName` | Creates `CUSTOMER`, sets session cookies / `409` |
| POST | `/api/auth/register-seller` | Public | `email`, `password`, `storeName`, `identificationDetails` | Creates `SELLER` (`PENDING`), sets session cookies / `409` |
| POST | `/api/auth/logout` | Any | — | Clears cookies & revokes `session_token_hash` |
| PUT | `/api/auth/password` | Authenticated | `currentPassword`, `newPassword` | Updates hash & revokes active session / `400` |
| GET | `/api/products` | Public | `category`, `brand`, `seller`, `size`, `color`, `search`, `sort` | Active products from approved sellers only |
| POST | `/api/orders` | OptionalAuth | Shipping fields, `paymentMethod`, `guestEmail` | Validates stock (no decrement yet), creates Order + SellerOrder slices |
| PATCH | `/api/orders/:orderNumber/cancel` | Owner / Admin | — | Cancels order; restores stock only if `stockDecremented` |
| POST | `/api/payments/confirm-sandbox` | Owner / Admin | `orderNumber`, `paymentMethod` | Calls `finalizePayment()` (idempotent) |
| POST | `/api/payments/webhook` | PayMongo (HMAC) | Raw JSON event + `paymongo-signature` | Verifies HMAC, logs `webhook_events`, calls `finalizePayment()` / `401` |
| POST | `/api/payments/simulate` | Owner / Admin | `orderNumber` | Requires `DEMO_FALLBACK_ENABLED` + `sandboxMode`; calls `finalizePayment()` (`SIMULATED`) / `403` |
| GET | `/api/seller/metrics` | Seller (Approved) | `period` (`7d`, `30d`, `90d`, `all`) | Per-product/variant metrics + High/Low/No sales badges / `404` for non-seller |
| POST/PUT | `/api/seller/products` | Seller (Approved) | `name`, `sku`, `categoryId`, `basePriceCentavos`, `audience`, `shoeType` | Creates/updates own product / `404` on alien product |
| DELETE/PATCH | `/api/seller/products/:id(/restore)` | Seller (Approved) | — | Soft archive / restore (`status`: `ARCHIVED` / `ACTIVE`) |
| POST | `/api/seller/products/:id/images` | Seller (Approved) | `image` (multipart PNG/JPG/WEBP <= 2MB) | Magic-byte validated upload / `400` |
| PATCH | `/api/seller/orders/:id/fulfill` | Seller (Approved) | `trackingNumber`, `carrier` | Requires `PAID` & no `stockConflict`; marks slice & items `SHIPPED` / `400`, `409` |
| GET | `/api/admin/analytics` | Admin | `period` (`7d`, `30d`, `90d`, `all`) | Platform totals + per-seller table + Online now badge / `403` |
| GET/PUT | `/api/admin/api-settings` | Admin | `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | Masked read; AES-256-GCM encrypted write; rejects live keys / `400` |
| GET | `/api/admin/webhooks` | Admin | — | Latest 50 `webhook_events` |
| GET | `/api/admin/health` | Admin | — | DB ping latency, sandbox status, 24h webhook failures, `demoFallbackEnabled` |
| PATCH | `/api/admin/users/:id/role` | Admin | `role` | Enforces D6 (no self-lockout, no demoting last admin), revokes target session |
| PATCH | `/api/admin/users/:id/status` | Admin | `accountStatus` | Enforces D6 (no self-lockout, no suspending last admin), revokes target session |
