# STRIDERA E-Commerce — Executed Test Report

**Execution Date:** 2026-10-28 (final run after multi-seller revision)  
**Environment:** Node.js v25.9.0 / Windows 11  
**Branch:** `revision/multi-seller`  
**Runner:** Native Node Test Runner (`node --test`)  
**Overall Status:** ✅ **28 PASSED / 0 FAILED / 0 SKIPPED**

---

## Suite 1: Functional Tests (`tests/functional.test.js`)

**Run command:** `node --test tests/functional.test.js`  
**Duration:** ~228ms | **Result: 12 PASS / 0 FAIL**

---

### § 1. Monetary Calculations & Minor Units (Centavos)

#### TC-1.1: Accurate subtotal in integer centavos
- **Preconditions:** Line items with unit prices `459900` and `389900` centavos, qty 2 and 1.
- **Steps:** Sum `(unitPrice × qty)` for each item.
- **Expected:** `1309700` centavos (₱13,097.00) — no float drift.
- **Actual:** `1309700` ✅
- **Status:** **PASS**

#### TC-1.2: Flat discount floor — no negative total
- **Preconditions:** Subtotal `50000` (₱500), flat discount `60000` (₱600).
- **Steps:** `appliedDiscount = Math.min(subtotal, discountValue)`
- **Expected:** Applied discount `50000`, grand total `0` (never negative).
- **Actual:** Applied `50000`, grand total `0` ✅
- **Status:** **PASS**

#### TC-1.3: Percentage discount with floor rounding
- **Preconditions:** Subtotal `459900` (₱4,599), 10% code, max ₱500 cap.
- **Steps:** `Math.floor((459900 × 10) / 100)` = `45990`
- **Expected:** Discount `45990`, grand total `413910`.
- **Actual:** Discount `45990`, grand total `413910` ✅
- **Status:** **PASS**

---

### § 2. Promo Code Engine Rules

#### TC-2.1: Accept valid percentage promo
- **Preconditions:** Active promo `STRIDE10`, 10%, max `50000` discount.
- **Expected:** Discount computed and applied successfully.
- **Actual:** Promo applied ✅
- **Status:** **PASS**

#### TC-2.2: Reject flat promo below minimum order
- **Preconditions:** Promo requires min order `300000`, subtotal is `200000`.
- **Expected:** Promo rejected with minimum order error.
- **Actual:** Rejected ✅
- **Status:** **PASS**

#### TC-2.3: Reject expired / deactivated promo
- **Preconditions:** Promo `isActive: false` and `expiresAt` in the past.
- **Expected:** Promo rejected.
- **Actual:** Rejected ✅
- **Status:** **PASS**

---

### § 3. Order & Stock Validation Rules

#### TC-3.1: Reject invalid quantity
- **Preconditions:** Quantities `0`, `-1`, `1.5`.
- **Expected:** All rejected as invalid.
- **Actual:** All rejected ✅
- **Status:** **PASS**

#### TC-3.2: Validate Philippine mobile numbers
- **Preconditions:** Valid `+639171234567`, invalid `12345`.
- **Expected:** Valid accepted, invalid rejected.
- **Actual:** Correct ✅
- **Status:** **PASS**

#### TC-3.3: Idempotency key construction
- **Preconditions:** Order ID and user ID supplied.
- **Expected:** Key is SHA-256 hash, deterministic for same inputs.
- **Actual:** Consistent hash produced ✅
- **Status:** **PASS**

---

### § 4. Multi-Seller Order Slicing & Subtotal Partitioning

#### TC-4.1: Partition line items into correct seller slices without losing centavos
- **Preconditions:** 3 items — 2 from Seller A, 1 from Seller B.
- **Steps:** Run slice partitioning algorithm; sum `subtotalCentavos` per slice.
- **Expected:**  
  - Slice A: `subtotalCentavos = 919800` (items 1+2)  
  - Slice B: `subtotalCentavos = 389900` (item 3)  
  - `919800 + 389900 = 1309700 = parentOrder.subtotalCentavos` ✅
- **Actual:** Correct ✅
- **Status:** **PASS**

---

### § 5. Inventory Restoration on Order Cancellation

#### TC-5.1: Atomic stock restore on slice cancellation
- **Preconditions:** Variant with `stock = 5`, PAID order with `qty = 2` deducted → `stock = 3`.
- **Steps:** Cancel the seller slice.
- **Expected:** Stock restored to `5` atomically.
- **Actual:** `stock = 5` ✅
- **Status:** **PASS**

#### TC-5.2: No negative inventory
- **Preconditions:** Variant `stock = 2`, adjustment requests `qty = 5`.
- **Expected:** Adjustment rejected; stock stays `≥ 0`.
- **Actual:** Rejected ✅
- **Status:** **PASS**

---

## Suite 2: Security Tests (`tests/security.test.js`)

**Run command:** `node --test tests/security.test.js`  
**Duration:** ~202ms | **Result: 16 PASS / 0 FAIL**

---

### § 1. Access Control & Role-Based Authorization

#### TC-S1.1: Unauthenticated → 401
- **Steps:** Call admin route with no token.
- **Expected:** `401 Unauthorized`
- **Actual:** `401` ✅ — **PASS**

#### TC-S1.2: Customer → admin route → 403
- **Steps:** Call admin route with a `CUSTOMER` role JWT.
- **Expected:** `403 Forbidden`
- **Actual:** `403` ✅ — **PASS**

#### TC-S1.3: Admin → admin route → 200
- **Steps:** Call admin route with an `ADMIN` role JWT.
- **Expected:** `200 OK`
- **Actual:** `200` ✅ — **PASS**

---

### § 2. Demo Safety Fallback Gatekeeper (DEMO_MODE)

#### TC-S2.1: Reject simulate when DEMO_MODE ≠ true
- **Preconditions:** `DEMO_MODE` unset.
- **Expected:** Simulate endpoint returns `403`.
- **Actual:** `403` ✅ — **PASS**

#### TC-S2.2: Reject simulate by non-admin even with DEMO_MODE=true
- **Preconditions:** `DEMO_MODE=true`, request from customer role.
- **Expected:** `403 Forbidden`
- **Actual:** `403` ✅ — **PASS**

#### TC-S2.3: Allow simulate by admin with DEMO_MODE=true
- **Preconditions:** `DEMO_MODE=true`, request from admin role.
- **Expected:** `200 OK`
- **Actual:** `200` ✅ — **PASS**

---

### § 3. Webhook Signature Verification

#### TC-S3.1: Accept legitimate webhook with valid HMAC
- **Steps:** Compute HMAC-SHA256 using webhook secret; compare with constant-time equality.
- **Expected:** Signature accepted.
- **Actual:** Accepted ✅ — **PASS**

#### TC-S3.2: Reject forged webhook
- **Steps:** Submit webhook with tampered body/signature.
- **Expected:** `400 Bad Request` — signature mismatch.
- **Actual:** `400` ✅ — **PASS**

---

### § 4. Input Sanitization & Password Strength

#### TC-S4.1: Reject short passwords
- **Steps:** Attempt registration with 7-char password.
- **Expected:** `400` validation error.
- **Actual:** `400` ✅ — **PASS**

#### TC-S4.2: Strip script tags from notes/addresses
- **Steps:** Submit `<script>alert('xss')</script>` in address notes.
- **Expected:** Script tags stripped from stored value.
- **Actual:** Stripped ✅ — **PASS**

---

### § 5. Multi-Seller Access Control & Tenant Isolation

#### TC-S5.1: Non-seller → seller portal → 404
- **Steps:** Customer-role JWT hits `/api/seller/products`.
- **Expected:** `404 Not Found` (not 403 — avoids disclosing route existence)
- **Actual:** `404` ✅ — **PASS**

#### TC-S5.2: Pending seller → seller portal → 403
- **Steps:** Seller with `sellerStatus = PENDING` hits `/api/seller/products`.
- **Expected:** `403 Forbidden` with pending review message.
- **Actual:** `403` ✅ — **PASS**

#### TC-S5.3: Approved seller → seller portal → 200
- **Steps:** Seller with `sellerStatus = APPROVED` hits `/api/seller/products`.
- **Expected:** `200 OK`
- **Actual:** `200` ✅ — **PASS**

#### TC-S5.4: Seller A cannot see Seller B's product → 404
- **Steps:** Seller A's JWT requests Seller B's product ID.
- **Expected:** `404 Not Found` (tenant isolation — 404 not 403 to preserve confidentiality)
- **Actual:** `404` ✅ — **PASS**

#### TC-S5.5: Seller sees own product → 200
- **Steps:** Seller A's JWT requests Seller A's own product.
- **Expected:** `200 OK`
- **Actual:** `200` ✅ — **PASS**

#### TC-S5.6: Admin can inspect any seller's product
- **Steps:** Admin JWT requests Seller A's product.
- **Expected:** `200 OK`
- **Actual:** `200` ✅ — **PASS**

---

## Summary

| Suite | Tests | Pass | Fail | Duration |
|-------|-------|------|------|---------|
| `functional.test.js` | 12 | **12** | 0 | ~228ms |
| `security.test.js` | 16 | **16** | 0 | ~202ms |
| **Total** | **28** | **28** | **0** | **~430ms** |

**All 28 tests PASS. No failures. No skipped tests.**

---

## Database Consistency Assertions (Manual)

Verified post-payment and post-cancellation:
- ✅ No negative `stock_quantity` values in `product_variants`
- ✅ No `PAID` order without a corresponding verified `Payment` record
- ✅ No orphan `SellerOrder` rows — every slice links to a valid parent `Order`
- ✅ Every stock adjustment has a corresponding `stock_movements` entry with a non-empty `reason`
