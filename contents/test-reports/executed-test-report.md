# STRIDERA E-Commerce — Executed Test Report

**Execution Date:** October 28, 2026  
**Environment:** Node.js v25.9.0 / Windows 11  
**Runner:** Native Node Test Runner (`node --test`)  
**Overall Status:** **19 PASSED / 0 FAILED / 0 SKIPPED** (Duration: 257ms)

---

## Suite 1: Functional Tests (`tests/functional.test.js`)

### Test Case 1.1: Monetary Calculations & Minor Units (Centavos)
- **Preconditions:** Line items with integer centavo unit prices (`459900`, `389900`).
- **Steps:** Sum item products `(unitPriceCentavos * quantity)`.
- **Expected Result:** Subtotal is exactly `1309700` centavos (₱13,097.00) with zero floating-point rounding drift.
- **Actual Result:** `1309700` centavos computed.
- **Status:** **PASS**

### Test Case 1.2: Flat Discount Floor Boundary
- **Preconditions:** Subtotal is ₱500.00 (`50000`), discount coupon value is ₱600.00 (`60000`).
- **Steps:** Compute applied discount `Math.min(subtotal, discount)` and final total.
- **Expected Result:** Applied discount is capped at subtotal (₱500.00); grand total is ₱0.00 (non-negative).
- **Actual Result:** Applied discount: `50000`, Grand total: `0`.
- **Status:** **PASS**

### Test Case 1.3: Percentage Discount Calculation
- **Preconditions:** Subtotal ₱4,599.00 (`459900`), 10% discount code (`STRIDE10`).
- **Steps:** Calculate `Math.floor((subtotal * 10) / 100)` and deduct from subtotal.
- **Expected Result:** Discount is 45,990 centavos (₱459.90); grand total is 413,910 centavos (₱4,139.10).
- **Actual Result:** Discount: `45990`, Grand total: `413910`.
- **Status:** **PASS**

### Test Case 1.4: Promo Code Validation — Percentage
- **Preconditions:** Promo code `STRIDE10` registered and active.
- **Steps:** Validate `STRIDE10` against subtotal `400000`.
- **Expected Result:** Validation succeeds (`valid: true`) with discount `40000`.
- **Actual Result:** `valid: true`, discount: `40000`.
- **Status:** **PASS**

### Test Case 1.5: Promo Code Validation — Minimum Order Threshold
- **Preconditions:** Promo code `WELCOME500` has minimum order requirement of ₱3,000.00 (`300000`).
- **Steps:** Apply `WELCOME500` to a cart subtotal of ₱2,500.00 (`250000`).
- **Expected Result:** Validation rejected with descriptive error message.
- **Actual Result:** Validation rejected: `Minimum order of ₱3000.00 required`.
- **Status:** **PASS**

### Test Case 1.6: Promo Code Validation — Deactivated / Expired
- **Preconditions:** Promo code `EXPIRED50` with `isActive: false`.
- **Steps:** Attempt validation against any cart total.
- **Expected Result:** Validation rejected: `Invalid or expired promo code`.
- **Actual Result:** Validation rejected: `Invalid or expired promo code`.
- **Status:** **PASS**

### Test Case 1.7: Order Item Quantity Validation
- **Preconditions:** Incoming order request payload with variable quantities.
- **Steps:** Validate `Number.isInteger(qty) && qty > 0`.
- **Expected Result:** Accepts positive integers (1, 5); rejects 0, negatives (-3), and floats (1.5).
- **Actual Result:** Exactly matched expected boolean conditions.
- **Status:** **PASS**

### Test Case 1.8: Philippine Mobile Number Validation
- **Preconditions:** Contact information field input.
- **Steps:** Test formats against regex `^(09|\+639)\d{9}$`.
- **Expected Result:** `09171234567` and `+63 917 123 4567` accepted; invalid lengths rejected.
- **Actual Result:** Validated successfully.
- **Status:** **PASS**

### Test Case 1.9: Idempotency Key Generation
- **Preconditions:** Order submission with unique order number.
- **Steps:** Generate SHA-256 digest hash.
- **Expected Result:** Produces 64-character hexadecimal idempotency string.
- **Actual Result:** Produced 64-char string.
- **Status:** **PASS**

---

## Suite 2: Security Tests (`tests/security.test.js`)

### Test Case 2.1: Admin Route Authentication Requirement
- **Preconditions:** Unauthenticated HTTP request (no JWT token / user object).
- **Steps:** Evaluate route guard middleware.
- **Expected Result:** HTTP 401 Unauthorized (`Authentication required`).
- **Actual Result:** Status 401 returned.
- **Status:** **PASS**

### Test Case 2.2: Admin Route Role Authorization
- **Preconditions:** Authenticated user with role `CUSTOMER`.
- **Steps:** Access `/api/admin` protected endpoint.
- **Expected Result:** HTTP 403 Forbidden (`Admin privileges required`).
- **Actual Result:** Status 403 returned with error message.
- **Status:** **PASS**

### Test Case 2.3: Admin Access Grant
- **Preconditions:** Authenticated user with role `ADMIN`.
- **Steps:** Access `/api/admin` endpoint.
- **Expected Result:** HTTP 200 OK access granted.
- **Actual Result:** Status 200 returned.
- **Status:** **PASS**

### Test Case 2.4: Demo Safety Gate — DEMO_MODE Disabled
- **Preconditions:** `DEMO_MODE=false` or undefined in environment.
- **Steps:** Admin sends POST request to `/api/payments/simulate`.
- **Expected Result:** Rejection with HTTP 403 `Demo mode is disabled`.
- **Actual Result:** Status 403 returned.
- **Status:** **PASS**

### Test Case 2.5: Demo Safety Gate — Non-Admin User in Demo Mode
- **Preconditions:** `DEMO_MODE=true`, request sent by standard shopper.
- **Steps:** Send POST to `/api/payments/simulate`.
- **Expected Result:** Rejection with HTTP 403 `Admin access required for demo fallback`.
- **Actual Result:** Status 403 returned.
- **Status:** **PASS**

### Test Case 2.6: Demo Safety Gate — Authorized Simulation
- **Preconditions:** `DEMO_MODE=true` AND authenticated user role is `ADMIN`.
- **Steps:** Execute simulate payment action.
- **Expected Result:** HTTP 200 OK, transitions order status and writes audit log.
- **Actual Result:** Status 200 granted.
- **Status:** **PASS**

### Test Case 2.7: Webhook Signature Verification — Legitimate
- **Preconditions:** PayMongo webhook payload with valid timestamp and HMAC-SHA256 signature.
- **Steps:** Compute expected signature using secret and verify using timing-safe comparison.
- **Expected Result:** Signature verification evaluates to `true`.
- **Actual Result:** Evaluated to `true`.
- **Status:** **PASS**

### Test Case 2.8: Webhook Signature Verification — Tampered Payload
- **Preconditions:** Payload data altered in transit while retaining original signature header.
- **Steps:** Verify against computed HMAC.
- **Expected Result:** Verification evaluates to `false`.
- **Actual Result:** Evaluated to `false`.
- **Status:** **PASS**

### Test Case 2.9: Password Strength Enforcement
- **Preconditions:** Registration requests with passwords under 8 characters.
- **Steps:** Check password length validation rule.
- **Expected Result:** Rejects `< 8` chars; accepts `>= 8` chars.
- **Actual Result:** Enforced accurately.
- **Status:** **PASS**

### Test Case 2.10: XSS Payload Sanitization in Text Fields
- **Preconditions:** Delivery instructions containing `<script>` injection payload.
- **Steps:** Sanitize string to remove malicious script elements.
- **Expected Result:** Strips executable script tags cleanly without breaking user message.
- **Actual Result:** `<script>alert("xss")</script>` removed; string safely sanitized.
- **Status:** **PASS**
