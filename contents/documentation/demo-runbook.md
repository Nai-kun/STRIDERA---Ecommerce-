# STRIDERA — Live Presentation & 7-Role Demo Runbook

## 1. Starting the Platform
Run three terminals (or use the running background services):
```powershell
# Terminal 1: Start Embedded PostgreSQL Server (with optional --reset-new --seed)
cd backend
node db-server.js

# Terminal 2: Start Express API Server (Port 4000)
cd backend
npm run dev

# Terminal 3: Start Next.js Frontend (Port 3000)
cd frontend
npm run dev
```

---

## 2. 1-Click 7-Role Demo Credentials (Password: `Password123!`)
Open `http://localhost:3000/account/login` and click any of the **7 Role Switcher buttons**:
1. **Role 1 — Shopper (`CUSTOMER`)**: `customer@stridera.ph` → `/shop`, `/checkout`, `/account/profile`
2. **Role 2 — Seller (`SELLER`)**: `seller@stridera.ph` → `/seller/dashboard`, `/seller/products`, `/seller/orders`
3. **Role 3 — Administrator (`ADMIN`)**: `admin@stridera.ph` → `/admin/dashboard`
4. **Role 4 — Inventory Manager (`INVENTORY_MANAGER`)**: `inventory@stridera.ph` → `/inventory`
5. **Role 5 — Delivery Personnel (`DELIVERY_PERSONNEL`)**: `delivery@stridera.ph` → `/delivery`
6. **Role 6 — Customer Support (`CUSTOMER_SUPPORT`)**: `support@stridera.ph` → `/support`
7. **Role 7 — Finance Officer (`FINANCE_OFFICER`)**: `finance@stridera.ph` → `/finance`

---

## 3. End-to-End 7-Role Walkthrough Script
1. **Shopper (`customer@stridera.ph`)**:
   - Browse `/shop`, filter by Seller (`Stride & Co. Official` vs `SoleCraft Manila`), select a footwear model, choose Color & Size, and add to cart.
   - Proceed to `/checkout`, select **GCash**, **Maya**, or **PayPal**, click **Place Order & Generate E-Wallet QR**, and click **✓ Authorize & Complete Payment** on the Sandbox QR modal.
2. **Inventory Manager (`inventory@stridera.ph`)**:
   - Open `/inventory` to inspect real-time SKU deductions, low-stock alerts, log a `+ Restock` incoming batch, and view the **Valuation & Seller Summary Report**.
3. **Seller (`seller@stridera.ph`)**:
   - Open `/seller/orders`, click **✓ Accept & Prepare Order**, then click **Mark Shipped & Add Tracking** to generate a courier waybill for Delivery Personnel.
4. **Delivery Personnel (`delivery@stridera.ph`)**:
   - Open `/delivery`, inspect the customer's recipient address and phone number, click **📦 Confirm Seller Collection & Start Transit**, then click **✓ Confirm Delivered & Record POD**.
5. **Customer Support (`support@stridera.ph`)**:
   - Open `/support`, inspect the customer ticket thread and linked order/payment/shipment diagnostics, reply to the customer, or click **💸 Approve & Escalate Refund to Finance**.
6. **Finance Officer (`finance@stridera.ph`)**:
   - Open `/finance`, click **✓ Verify Reference** on e-wallet payments, review the `5%` platform commission breakdown, click **Disburse Payout** to settle seller earnings, or process approved refunds.
7. **Administrator (`admin@stridera.ph`)**:
   - Open `/admin/dashboard` to review 30-day revenue KPIs, manage all 7 roles under **Users & 7 Roles**, approve pending sellers under **Merchants & Approvals**, and adjust commission/wallet settings under **Platform Settings**.
