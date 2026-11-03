# STRIDERA — Multi-Seller Footwear E-Commerce & 7-Role Enterprise Operations Platform

STRIDERA is a full-stack multi-seller footwear marketplace built with **Next.js 14 (App Router)**, **Express.js**, **Prisma ORM**, and **PostgreSQL (Embedded PGlite)**, engineered to fulfill every functional (`FR-1.1`–`FR-10.10`) and non-functional (`NFR-1`–`NFR-36`) requirement in `source/IPT.pdf`.

---

## 👥 7 User Roles & Dedicated Portals (`Password123!`)

| Role | Enum | Email | Portal Route | Key Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **1. Shopper** | `CUSTOMER` | `customer@stridera.ph` | `/`, `/shop`, `/checkout`, `/account/profile` | Browse multi-seller catalog, filter by size/color/seller/price, GCash/Maya/PayPal QR checkout, confirm receipt, reviews, support tickets |
| **2. Seller** | `SELLER` | `seller@stridera.ph` | `/seller/dashboard`, `/seller/products`, `/seller/orders` | Store profile, product/SKU CRUD, accept & fulfill order slices, courier tracking, net earnings & payout ledger |
| **3. Administrator** | `ADMIN` | `admin@stridera.ph` | `/admin/dashboard` | Executive KPIs, 7-role user governance, seller verification (`identificationDetails`), brand governance, platform settings, audit logs |
| **4. Inventory Manager** | `INVENTORY_MANAGER` | `inventory@stridera.ph` | `/inventory` | Warehouse SKU monitor, low-stock alerts, incoming restocks, outgoing dispatches, manual adjustments, movement audit log, valuation report |
| **5. Delivery Personnel** | `DELIVERY_PERSONNEL` | `delivery@stridera.ph` | `/delivery` | Courier manifest, customer delivery details, accept assignment, confirm seller pickup, transit updates, Proof of Delivery (POD), failed/return |
| **6. Customer Support** | `CUSTOMER_SUPPORT` | `support@stridera.ph` | `/support` | Support ticket queue, order/payment/shipment diagnostic lookup, ticket replies, cancellation/return approval, escalate refund to Finance |
| **7. Finance Officer** | `FINANCE_OFFICER` | `finance@stridera.ph` | `/finance` | E-wallet payment reference verification, `5%` platform commission breakdown, seller payout settlement, approved refund processing, financial report |

---

## 🚀 Quick Start

```powershell
# 1. Start Embedded PostgreSQL Server (auto-migrates & seeds all 7 roles)
cd backend
node db-server.js --reset-new --seed
node db-server.js

# 2. Start Backend API (http://localhost:4000)
cd backend
npm run dev

# 3. Start Frontend App (http://localhost:3000)
cd frontend
npm run dev
```

---

## 🧪 Automated Testing

```powershell
node --test tests/functional.test.js tests/security.test.js
```
