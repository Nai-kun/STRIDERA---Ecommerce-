# Demo Runbook — STRIDERA Multi-Seller E-Commerce

> **Audience**: Presenter / IPT evaluator  
> **Duration**: ~10 minutes for full walkthrough  
> **Prerequisites**: App running locally (`backend` on port 4000, `frontend` on port 3000), database seeded

---

## Pre-Demo Checklist

- [ ] `backend/.env` has `DEMO_MODE=true`
- [ ] Backend running: `cd backend && node server.js`
- [ ] Frontend running: `cd frontend && npm run dev`
- [ ] Database seeded: `node database/seeds/seed.js`
- [ ] Open browser to **http://localhost:3000**

---

## Demo Flow 1: Shopper Checkout (Full E-Wallet Path)

### Step 1 — Browse the Catalog
1. Open http://localhost:3000
2. Click **Shop** in the navbar
3. Apply a filter: select **Brand → STRIDERA Lab** in the sidebar
4. Observe: products filtered to the STRIDERA Lab brand, brand badge visible on product cards

### Step 2 — Product Detail & Variant Selection
1. Click any product card
2. Select a **size** (e.g., US 9) and a **color** (e.g., Midnight Black)
3. Observe: stock indicator shows "In Stock" / "Low Stock" / "Out of Stock" per variant
4. Set quantity to **1**
5. Click **Add to Cart**

### Step 3 — Cart Review
1. Click **Cart** in the navbar (or the cart badge)
2. Observe: item appears with unit price in ₱, subtotal, shipping fee, grand total
3. Enter promo code **STRIDE10** → click Apply
4. Observe: 10% discount applied (max ₱500), totals update
5. Click **Proceed to Checkout**

### Step 4 — Checkout & Payment
1. Fill in shipping details (use any name/address, e.g., *Manila, Metro Manila 1000*)
2. Click **Place Order**
3. The app attempts to create a PayMongo checkout session:
   - **With PayMongo keys**: you are redirected to the PayMongo sandbox page — complete with a test GCash/Maya payment
   - **Without keys (Demo Mode)**: a yellow banner appears with **⚡ Demo: Simulate Payment Success** button

### Step 5 — Simulate Payment (Demo Mode)
1. Click **⚡ Demo: Simulate Payment Success**
2. Observe: order status immediately updates to **PAID**
3. Order confirmation shows order number, items, and payment status

---

## Demo Flow 2: Seller Fulfillment

### Step 6 — Seller Login
1. Click **Login** → log in as `seller@stridera.ph` / `Seller@123!`
2. Click **Merchant Hub** in the navbar (or navigate to `/seller/dashboard`)
3. Observe: dashboard shows KPIs — products listed, orders pending/paid, revenue total

### Step 7 — View & Fulfill an Order Slice
1. Click **Orders** in the Merchant Hub sidebar
2. Find the order placed in Step 3–5 — status shows **PAID**
3. Click **Fulfill** → enter a tracking number (e.g., `LBC-12345678`)
4. Click **Mark as Shipped**
5. Observe: slice status changes to **SHIPPED**

### Step 8 — Stock Adjustment (Audit Trail)
1. Click **Products** → select any product
2. Find a variant row → click **Adjust Stock**
3. Enter a new quantity and a reason (e.g., `Manual recount after warehouse audit`)
4. Submit — observe: stock updated, audit movement recorded

---

## Demo Flow 3: Admin Control Center

### Step 9 — Admin Login
1. Log out → log in as `admin@stridera.ph` / `Admin@Stridera2024!`
2. Click **Admin** in the navbar → **Admin Dashboard**

### Step 10 — Approve a Pending Seller
1. Scroll to **Seller Applications** panel
2. Find `pending.seller@stridera.ph` — status: **PENDING**
3. Click **Approve** → confirm
4. Observe: status changes to **APPROVED**; seller can now log in and access the portal

### Step 11 — Masked Config Audit
1. Scroll to **Platform Config Status** panel
2. Observe: PayMongo key shown as `sk_test_...abcd` (never the full key)
3. DEMO_MODE shows `true`
4. Database: shows host/database name only, password masked

### Step 12 — Payment Logs
1. Scroll to **Payment Logs** panel
2. Observe: the simulated payment from Step 5 appears with `is_demo: true` flag
3. Demo payments are visually distinguished from real webhook-verified payments

---

## Demo Flow 4: Brand Directory

### Step 13 — Brand Pages
1. Navigate to **http://localhost:3000/brands**
2. Observe: brand cards for **STRIDERA Lab** and **Apex Athletics**
3. Click **STRIDERA Lab** → brand storefront page shows brand description and all products

---

## Seed Credentials Reference

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@stridera.ph` | `Admin@Stridera2024!` |
| Approved Seller | `seller@stridera.ph` | `Seller@123!` |
| Pending Seller | `pending.seller@stridera.ph` | `Seller@123!` |
| Customer | `demo@stridera.ph` | `Customer@123!` |

---

## Promo Codes

| Code | Discount |
|------|---------|
| `STRIDE10` | 10% off (max ₱500 discount) |
| `LAUNCH500` | ₱500 flat off orders ≥ ₱3,000 |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Cart is empty" on checkout | Add items via Shop → Product Detail first |
| Payment session fails | Ensure `DEMO_MODE=true` in `backend/.env` and use the ⚡ simulate button |
| Seller portal shows 403 | Seller account may be PENDING — log in as admin and approve first |
| Backend 500 error on startup | Run `npx prisma generate` inside `backend/` directory |
| "Relation does not exist" DB error | Run `npx prisma db push` from `backend/` then re-seed |
