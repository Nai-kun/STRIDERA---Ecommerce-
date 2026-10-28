# Decision Log — STRIDERA Multi-Seller Revision

> Branch: `revision/multi-seller` | Maintained throughout implementation phases

Captures every significant architectural or design decision, its rationale, alternatives considered, and consequences.

---

## DEC-01: `404` (not `403`) for Cross-Seller Tenant Isolation

**Date**: 2026-10-28  
**Slice**: B, C  
**Context**: When an approved seller requests a product or order slice that belongs to another seller, what HTTP status code should be returned?

**Decision**: Return `404 Not Found`.

**Rationale**: A `403 Forbidden` response leaks the existence of the resource. A `404` response treats the resource as non-existent from the perspective of that seller's tenant, achieving confidentiality without revealing that the resource exists under another account. This pattern follows the principle of least disclosure (OWASP A01).

**Alternatives considered**:
- `403 Forbidden` — rejected; discloses resource existence to adversarial sellers.
- `401 Unauthorized` — rejected; actor is authenticated, the issue is ownership.

**Consequences**: Seller-facing error messages say "Product not found" which may be slightly confusing in debugging, but this is acceptable for the security gain.

**Implemented in**: `seller.routes.js` ownership checks for products, variants, and orders.

---

## DEC-02: Integer Centavos for All Monetary Values

**Date**: 2026-10-27  
**Slice**: A (Data Foundation)  
**Context**: PHP amounts need to be stored and calculated across subtotals, discounts, shipping, and grand totals.

**Decision**: Store and compute all money exclusively as integer centavos (e.g., ₱4,599.00 = `459900`).

**Rationale**: JavaScript IEEE 754 double-precision floating-point arithmetic produces rounding errors when summing prices (e.g., `0.1 + 0.2 ≠ 0.3`). Using integers eliminates all float drift. The PHP centavo is the smallest representable unit.

**Alternatives considered**:
- Decimal strings — accurate but require BigDecimal parsing, adds complexity.
- Floating point with `toFixed(2)` rounding — rejected; introduces drift across multi-item orders.

**Consequences**: All frontend display code must divide by 100 before rendering. Test `functional.test.js §1` verifies this invariant.

**Implemented in**: All Prisma schema monetary fields (`basePriceCentavos`, `grandTotalCentavos`, `subtotalCentavos`, etc.).

---

## DEC-03: Two-Gate Paid Entry Points for Order Payment

**Date**: 2026-10-28  
**Slice**: D (Payment & Slicing)  
**Context**: How does an order transition from `PENDING` to `PAID` status?

**Decision**: Exactly two code paths may mark an order PAID:
1. **Verified PayMongo webhook** (`POST /api/payments/webhook`) — validates HMAC-SHA256 signature.
2. **Admin-gated demo simulate** (`POST /api/payments/simulate`) — requires `role = ADMIN` AND `DEMO_MODE=true`.

**Rationale**: Browser-side redirect callbacks (success/failure return URLs) are never trusted for status updates because they can be forged. Any order marked PAID must have cryptographic or admin-verified authority behind it.

**Alternatives considered**:
- Trusting return URL query params — rejected; trivially forgeable.
- Client-side polling to update status — rejected; same forgery risk.

**Consequences**: The demo simulate button in the frontend is visually distinct (⚡ icon, warning text) to avoid confusion with real payment. Non-admin users cannot see or trigger it.

**Implemented in**: `payment.routes.js`, `security.test.js §2`, DFD Level 2 process 4.5.

---

## DEC-04: Atomic `SellerOrder` Slicing Inside Checkout Transaction

**Date**: 2026-10-28  
**Slice**: D  
**Context**: Orders may contain items from multiple sellers. When should per-seller slices be created?

**Decision**: Slice creation happens inside the same `prisma.$transaction()` block as the parent `Order` creation during checkout. If any slice write fails, the entire checkout rolls back.

**Rationale**: Prevents orphan orders (parent order exists but slices missing) or partial slice creation. Stock consistency, promo application, and slice creation are all atomic.

**Alternatives considered**:
- Create slices after payment confirmation — rejected; risks dangling orders with no slice context for sellers.
- Background job slicing — rejected; adds infrastructure complexity outside scope.

**Consequences**: Checkout is slightly heavier per request, but correctness is guaranteed. `functional.test.js §4` verifies the partitioning invariant.

**Implemented in**: `order.routes.js` `POST /api/orders`.

---

## DEC-05: Secret Hygiene in `config-status` Endpoint

**Date**: 2026-10-28  
**Slice**: E (Admin Enhancements)  
**Context**: Admin dashboard needs to show whether secrets are configured, but secrets must never be exposed in API responses.

**Decision**: `GET /api/admin/config-status` returns masked previews:
- PayMongo key: `sk_test_...abcd` (first 8 + last 4 chars)
- Webhook secret: `wh_...wxyz` (first 4 + last 4 chars)
- Database URL: only `host` and `database` fields; password and port are masked
- JWT secret: only `{ set: true }` — no preview at all

**Rationale**: Presenters need to verify configuration is set without actually seeing the secret values. Truncated previews allow visual confirmation while remaining useless for authentication.

**Alternatives considered**:
- Boolean `set: true/false` only — sufficient but less helpful for debugging key confusion.
- Full secret value in response — rejected; would appear in server logs, browser network tab, etc.

**Consequences**: A presenter can verify the correct PayMongo key is loaded without risk of credential leak.

**Implemented in**: `admin.routes.js GET /config-status`.

---

## DEC-06: Stock Restore Atomicity on Slice Cancellation

**Date**: 2026-10-28  
**Slice**: B, F  
**Context**: When a seller cancels a PAID order slice, variant stock must be restored. Should this be a separate background job?

**Decision**: Stock restoration is synchronous and inside the same `prisma.$transaction()` as the slice status update. Both succeed or both fail.

**Rationale**: A background job would create a window where the slice is CANCELLED but stock is not yet restored, potentially blocking new orders for unavailable variants incorrectly, or missing the restore entirely on crash.

**Alternatives considered**:
- Background job — rejected; atomicity not guaranteed.
- Optimistic update — rejected; same consistency risk.

**Consequences**: Cancellation endpoint is transactional and slightly slower, but stock integrity is guaranteed. `functional.test.js §5` verifies the restore invariant.

**Implemented in**: `seller.routes.js PATCH /orders/:id/cancel`.

---

## DEC-07: `SELLER` Role on the User Model vs. Separate `Seller` Entity

**Date**: 2026-10-27  
**Slice**: A  
**Context**: Should sellers be represented as a separate database table or as a role flag on the existing `User` model?

**Decision**: Extend the existing `User` model with `role = SELLER`, `sellerStatus`, and `storeName` fields rather than a separate `sellers` table.

**Rationale**: Sellers are users of the system — they log in, have sessions, and share the same authentication flow. A separate table would require complex JOINs on every auth check. The additional fields are sparse and nullable, adding minimal overhead.

**Alternatives considered**:
- Separate `sellers` table with FK to `users` — rejected; increases query complexity with no significant benefit at this scale.
- Seller as a subtype of User using Prisma's `@relation` discriminated union — too complex for the current scope.

**Consequences**: The `User` model has nullable seller-specific fields (`storeName`, `storeDescription`, `sellerStatus`). These are `null`/`NONE` for all non-seller users.

**Implemented in**: `backend/prisma/schema.prisma`, `database/migrations/002_multi_seller.sql`.

---

## DEC-08: Fallback Requirements Source (No `skill/resources/` Bundle)

**Date**: 2026-10-27  
**Phase**: 0 (Intake)  
**Context**: `skill/SKILL UPDATE.md` references resource files (`skill/resources/`) that were not present in the repository. `source/IPT revised.pdf` is a binary file that cannot be text-read by the toolchain.

**Decision**: Follow the skill's own fallback rule — derive requirements from:
1. `contents/documentation/requirements.md` (existing spec)
2. `source/DFD/revised*.mmd` (revised source DFDs — these are text files)
3. `contents/documentation/design-system.md` (visual spec)

**Rationale**: The revised DFDs (5 files) precisely document every process, data store, and external entity for the multi-seller architecture. Combined with the requirements doc, they provide sufficient fidelity to implement all slices.

**Consequences**: All 5 source DFDs were treated as the authoritative revised spec. Implementation decisions align exactly with the DFD process decompositions.

