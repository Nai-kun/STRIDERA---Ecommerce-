# STRIDERA — Multi-Seller Footwear E-Commerce & 7-Role Enterprise Operations Platform

STRIDERA is a full-stack multi-seller footwear marketplace built with **Next.js 16 (App Router)**, **Express.js 5**, **Prisma ORM 7**, and **PostgreSQL (Embedded PGlite)**, engineered to fulfill `source/IPT.pdf` (`FR-1.1`–`FR-10.10`, `NFR-1`–`NFR-36`) and integrated with the live **PSGC Philippine Address API** (`https://psgc.gitlab.io/api`).

---

## 7 User Roles & Dedicated Portals

| Role | Enum | Email | Portal Route | Key Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **1. Shopper** | `CUSTOMER` | `demo@stridera.ph` | `/`, `/shop`, `/checkout`, `/account/profile` | Browse multi-seller catalog, filter by size/color/seller/price, live PSGC Philippine address lookup, sandbox e-wallet checkout (GCash, Maya, PayPal), confirm receipt, reviews, support tickets |
| **2. Seller** | `SELLER` | `seller@stridera.ph`, `sole@stridera.ph` | `/seller/dashboard`, `/seller/products`, `/seller/orders` | Store profile, product/SKU CRUD, image upload, accept & fulfill paid order slices, courier tracking, net earnings |
| **3. Administrator** | `ADMIN` | `admin@stridera.ph` | `/admin/dashboard` | Executive KPIs, 7-role user governance, seller verification, brand governance, PSGC health & audit logs |
| **4. Inventory Manager** | `INVENTORY_MANAGER` | `inventory@stridera.ph` | `/inventory` | Warehouse SKU monitor, low-stock alerts, incoming restocks, outgoing dispatches, manual adjustments, movement audit log |
| **5. Delivery Personnel** | `DELIVERY_PERSONNEL` | `delivery@stridera.ph` | `/delivery` | Courier manifest, customer delivery details, accept assignment, confirm seller pickup, transit updates, Proof of Delivery (POD) |
| **6. Customer Support** | `CUSTOMER_SUPPORT` | `support@stridera.ph` | `/support` | Support ticket queue, order/payment/shipment diagnostic lookup, ticket replies, cancellation/return approval, refund escalation |
| **7. Finance Officer** | `FINANCE_OFFICER` | `finance@stridera.ph` | `/finance` | E-wallet payment reference verification, `5%` platform commission breakdown, seller payout settlement, refund processing, financial report |

*(Demo credentials are seeded by `database/seeds/seed.js` for local evaluation only.)*

---

## PSGC Philippine Address API (Cascading Address Lookup & Verification)

STRIDERA integrates the live **Philippine Standard Geographic Code (PSGC) API** (`https://psgc.gitlab.io/api`, PSA official divisions — **no API key required**) through a dedicated server-side client (`backend/src/services/psgcClient.js`) and backend proxy (`/api/locations/*`):

- **Cascading UI:** Checkout Step 2 (`Shipping`), Customer Profile (`Add New Address`), and Order Details display `Region → Province → City/Municipality → Barangay`, automatically handling regions without provinces (such as **NCR / Metro Manila**).
- **24-Hour Server-Side Caching & Resilience:** Responses are cached in memory (`PSGC_CACHE_TTL_MS=86400000`), bounded by `PSGC_TIMEOUT_MS=8000` timeouts and `PSGC_MAX_RETRIES=2` exponential retries.
- **Server-Side Validation:** When PSGC codes are submitted to `POST /api/orders` or `POST /api/auth/addresses`, the backend validates the full hierarchy against PSGC and overwrites browser-supplied names with canonical PSGC names (`addressSource = PSGC_VERIFIED`).
- **Honest Manual Fallback:** If the upstream PSGC API is unreachable or times out, checkout and profile forms explicitly switch to **Manual Address Fallback** (`MANUAL_FALLBACK`) instead of blocking shoppers or returning fake locations.
- **Health Diagnostics:** Admin **System Health Diagnostics** (`GET /api/admin/health`) probes `GET /regions.json` live and reports latency, region count, and cache hit metrics.

Optional environment overrides in `backend/.env`:
```env
PSGC_API_BASE_URL=https://psgc.gitlab.io/api
PSGC_TIMEOUT_MS=8000
PSGC_MAX_RETRIES=2
PSGC_CACHE_TTL_MS=86400000
```

---

## Quick Start

```powershell
# 1. Start Embedded PostgreSQL Server (applies schema + additive migrations; add --seed on first setup)
cd backend
node db-server.js

# 2. Start Backend API (http://127.0.0.1:5000)
cd backend
npm start

# 3. Start Frontend App (http://127.0.0.1:3000)
cd frontend
npm run dev
```

---

## Automated Testing

```powershell
node --test tests/functional.test.js tests/security.test.js tests/revision.test.js tests/psgc.test.js
```
