---
name: stridera-revision
description: Revises, extends, audits, tests, and documents the Stridera multi-seller footwear e-commerce platform against source/IPT.pdf (7 user roles: Shopper, Seller/Merchant, Administrator/Presenter, Inventory Manager, Delivery Personnel, Customer Support Personnel, and Finance Officer; 10 Functional Requirement Feature Sets FR-1.1 to FR-10.10; 36 Non-Functional Requirements NFR-1 to NFR-36; 7 Process Flows; Level 0/1/2 DFDs; Proposed Data Model; and E-Wallet Sandbox API Integration for GCash, Maya, and PayPal). Use this skill whenever the user asks to audit, revise, build, extend, fix, restyle, test, or document the Stridera project.
---

# Stridera Multi-Seller E-Commerce Platform Skill (`source/IPT.pdf` Complete Specification)

You are acting as a **Principal Full-Stack Software Engineer, Database Architect, Security Engineer, Prompt Engineer, UI/UX Designer, and QA Lead** revising and completing the **STRIDERA** multi-seller footwear e-commerce platform.

Stridera showcases a seamless footwear shopping experience powered by e-wallet sandbox API integration (GCash, Maya, PayPal via PayMongo/Sandbox Adapter) alongside full multi-seller marketplace operations and role-isolated operational portals across **7 distinct user personas**.

When priorities collide, rank them strictly:
1. **Transaction & Inventory Integrity** (atomic stock operations, integer centavos arithmetic, idempotent payments)
2. **Security & Role/Tenant Isolation** (RBAC across all 7 roles, strict seller isolation returning `404` for alien resources, hashed credentials, audit logging)
3. **Functional Completeness & Zero Dead Controls** (every button, filter, modal, form, and workflow across all 7 portals works end-to-end)
4. **Usability & Visual Polish** (responsive layout, clear status feedback, accessible controls, `prefers-reduced-motion` support)

Governing execution sequence:
**INSPECT SOURCE → AUDIT PROJECT → ANALYZE GAPS → PLAN & SCHEMA → IMPLEMENT VERTICAL SLICES → VERIFY E2E → DOCUMENT → REPORT**

---

## 1. Ground Rules & Engineering Invariants

1. **Revise and Extend cleanly.** Preserve the existing stack (`Next.js 14 App Router` frontend, `Node.js / Express` backend, `Prisma ORM` + embedded `PGlite / PostgreSQL` database). All schema changes must be additive and backward-compatible.
2. **Zero Dead Controls.** Every button, link, tab, filter, dropdown, modal, and form across all 7 role interfaces must perform a real, persisted action with clear visual feedback. Never leave `href="#todo"` or inert buttons.
3. **Server is the Single Source of Truth.** Never trust client-supplied prices, subtotals, discounts, platform fees, seller earnings, user roles, or `sellerId`. Recompute all monetary values server-side in **integer centavos (`PHP`)**.
4. **Payment Finalization has Exactly Two Verified Doors:**
   - Door 1: Verified payment provider webhook/callback (`POST /api/payments/webhook` or sandbox checkout confirmation endpoint `/api/payments/confirm-sandbox`).
   - Door 2: Authorized Demo Safety Fallback (`POST /api/payments/simulate` when `DEMO_MODE=true`).
   - Both doors execute the exact same atomic transaction updating `Order`, `Payment`, and all child `SellerOrder` slices to `PAID`, recording transaction references and audit logs.
5. **Resilient Sandbox E-Wallet Experience.** Even when external live API keys (`PAYMONGO_SECRET_KEY`) are not configured in local/offline environments, `POST /api/payments/create-session` must never dead-end with a `503`. It must gracefully generate a functional **Sandbox E-Wallet Checkout & QR Code Session** (supporting GCash, Maya, and PayPal) so the shopper or presenter can complete simulated payment interactions seamlessly.
6. **Strict Role-Based Access Control (RBAC) & Seller Isolation:**
   - Enforce server-side middleware checks for all **7 roles**: `CUSTOMER` (Shopper), `SELLER`, `ADMIN`, `INVENTORY_MANAGER`, `DELIVERY_PERSONNEL`, `CUSTOMER_SUPPORT`, and `FINANCE_OFFICER`.
   - Sellers can only read/write their own products, variants, stock, and order slices. Attempting to access another seller's resource must return `404 Not Found` (preventing ID enumeration).
7. **Atomic Stock Control & Movement Ledger.** Inventory quantities must never drop below `0` (`NFR-28`). Every stock change (initial seed, order checkout, cancellation restore, seller adjustment, inventory manager incoming/outgoing/manual adjustment, return restock) must atomically update `ProductVariant.stockQuantity` and write an immutable `StockMovement` record.

---

## 2. Source Precedence & Reference Baseline

| Rank | Source Material | Scope Governed | Rule |
|---|---|---|---|
| **1** | `source/IPT.pdf` (22 pages) | All 7 user roles, Features 1–10 (`FR-1.1` to `FR-10.10`), `NFR-1` to `NFR-36`, Process Flows 1–7, DFDs, MoSCoW, Proposed Data Model | Authoritative functional & architectural specification. |
| **2** | Existing Working Codebase & Database | Stack conventions, routes, Prisma models, existing tests | Extend without breaking existing passing functionality. |
| **3** | `source/DFD/*.mmd`, `source/STRIDERA_LOGO.png`, `source/product_images/pcs/*` | Visual identity, footwear photography, diagram baselines | Keep `source/` read-only for binary assets; keep diagrams synchronized with implementation. |

---

## 3. Complete Specification Distilled from `source/IPT.pdf`

### A. The 7 Identified User Roles & Context of Use (`Section B` & `FR-1.3`)

| # | Persona | Enum Role | Portal Route | Core Responsibilities |
|---|---|---|---|---|
| 1 | **The Shopper** | `CUSTOMER` | `/`, `/shop`, `/products/[slug]`, `/cart`, `/checkout`, `/account/orders`, `/account/profile` | Browse shoes, filter by category/brand/price/size/color/seller, view seller identity badges, select variants, checkout via e-wallet (GCash/Maya/PayPal) or QR code, track shipments, confirm order receipt, submit product/seller reviews, request cancellations/returns/refunds, open support inquiries. |
| 2 | **The Seller / Merchant** | `SELLER` | `/seller/dashboard`, `/seller/products`, `/seller/orders`, `/seller/register` | Register store & identification details, manage store profile/logo, create/edit/archive products & variants (sizes, colors, SKUs, prices, stock), view own order slices, acknowledge/accept paid orders (`CONFIRMED`/`PREPARING`), enter courier & tracking numbers (`SHIPPED`), monitor store sales & net earnings. |
| 3 | **The Administrator / Presenter** | `ADMIN` | `/admin/dashboard` | Oversee platform operations, approve/reject/suspend sellers & verify identification profiles, manage all user accounts (activate/deactivate/suspend) & assign roles across all 7 roles, manage brands/categories/promotions, monitor all orders/payments/shipments, configure platform settings & sandbox parameters, trigger Demo Simulate Payment, review system audit logs & marketplace reports. |
| 4 | **The Inventory Manager** | `INVENTORY_MANAGER` | `/inventory` | Monitor stock levels across all sellers & variants, record incoming stock deliveries (`INCOMING`), record outgoing stock reductions (`OUTGOING`), perform manual stock adjustments with reasons (`ADJUSTMENT`), identify low-stock (`<= threshold`) and out-of-stock variants, update product availability, review movement history, generate inventory reports. |
| 5 | **The Delivery Personnel** | `DELIVERY_PERSONNEL` | `/delivery` | View assigned shipments & customer delivery details, accept delivery assignments, confirm package collection from seller, update shipment status (`PREPARING`, `SHIPPED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`), upload Proof of Delivery (photo URL / recipient acknowledgment), record failed deliveries with reason (`Incorrect Address`, `Recipient Unavailable`, `Damaged Package`, `Rejected` → `FAILED` / `RETURN_PENDING`), view shipment history. |
| 6 | **The Customer Support Personnel** | `CUSTOMER_SUPPORT` | `/support` | View support dashboard & ticket queue, review customer account & order/payment/shipment details, respond to inquiries & complaints, process eligible order cancellation requests, coordinate return requests, review refund requests & escalate/forward for Finance approval, update ticket statuses (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), maintain support history. |
| 7 | **The Finance Officer** | `FINANCE_OFFICER` | `/finance` | Monitor e-wallet transactions & verify payment references, monitor completed paid orders, calculate gross sales revenue, calculate marketplace platform fees (configurable `%`), calculate net seller earnings, record/simulate seller payouts, review & process approved refunds, maintain financial ledger history, generate financial reports. |

---

### B. Functional Requirements Checklist (`Section C`: Features 1–10)

#### Feature 1: User Authentication and Account Management (`FR-1.1` – `FR-1.10`)
- `FR-1.1` **User Registration**: Shoppers register with name, email, contact number, and password (`POST /api/auth/register`).
- `FR-1.2` **User Login**: Email & password login (`POST /api/auth/login`) with role-aware redirect and demo quick-login support.
- `FR-1.3` **Role-Based Access Control**: Distinct dashboard access for all 7 roles (`CUSTOMER`, `SELLER`, `ADMIN`, `INVENTORY_MANAGER`, `DELIVERY_PERSONNEL`, `CUSTOMER_SUPPORT`, `FINANCE_OFFICER`).
- `FR-1.4` **Seller Registration**: Merchants submit store name, description, contact info, and identification details (`POST /api/auth/register-seller`).
- `FR-1.5` **Seller Account Verification**: Admin reviews, approves (`APPROVED`), rejects (`REJECTED`), or suspends (`SUSPENDED`) seller registrations (`PATCH /api/admin/sellers/:id/status`).
- `FR-1.6` **Account Profile Management**: Users view and update personal info, phone, and saved addresses (`GET/PUT /api/auth/profile`, `/account/profile`).
- `FR-1.7` **Password Management**: Users change passwords (`PUT /api/auth/password`) and request password recovery (`POST /api/auth/forgot-password`).
- `FR-1.8` **Account Logout**: Ends active session (`POST /api/auth/logout`).
- `FR-1.9` **Account Status Management**: Admin activates (`ACTIVE`), deactivates (`DEACTIVATED`), or suspends (`SUSPENDED`) user accounts (`PATCH /api/admin/users/:id/status`).
- `FR-1.10` **Login Validation**: Validates credentials and account status, returning clear error messages.

#### Feature 2: Multi-Seller Product Selection & Filtering (`FR-2.1` – `FR-2.12`)
- `FR-2.1` **Product Catalog Display**: Displays footwear with names, images, brands, prices, ratings, and descriptions.
- `FR-2.2` **Product Categorization**: Organizes footwear into categories (Running, Lifestyle/Sneakers, Basketball, Training, Casual, Boots).
- `FR-2.3` **Multi-Seller Product Listings**: Multiple sellers list products across brands/models.
- `FR-2.4` **Seller Identification Display**: Displays seller store name, verified badge, and profile alongside listings on catalog cards, PDP, cart, and checkout.
- `FR-2.5` **Product Search**: Keyword search across product names, brands, SKUs, and descriptions.
- `FR-2.6` **Product Filtering**: Filter by category, brand, price range (`minPrice`, `maxPrice`), size, color, and seller (`sellerId`).
- `FR-2.7` **Product Details**: Complete PDP with gallery, sizes, colors, prices, seller profile, and customer reviews.
- `FR-2.8` **Product Variant Selection**: Interactive size and color swatches.
- `FR-2.9` **Product Availability Checking**: Verifies variant stock before adding to cart.
- `FR-2.10` **Product Price Display**: Shows active variant price or base price in PHP (`₱`).
- `FR-2.11` **Out-of-Stock Notification**: Disables zero-stock size/color combinations and notifies shopper.
- `FR-2.12` **Product Sorting**: Sort by price (`price-asc`, `price-desc`), newest (`newest`), oldest (`oldest`), and name (`name-asc`).

#### Feature 3: Shopping Cart and Order Management (`FR-3.1` – `FR-3.12`)
- `FR-3.1` – `FR-3.4` **Cart Operations**: Add to cart, display product/seller/size/color/qty/unit price, modify qty or remove, automatic server-side subtotal calculation.
- `FR-3.5` **Cart Availability Validation**: Rechecks stock and product/seller active status at checkout.
- `FR-3.6` – `FR-3.8` **Checkout & Order Creation**: Captures delivery address & contact info, displays complete order summary, creates `Order` and per-seller `SellerOrder` slices + initial `Shipment` records.
- `FR-3.9` – `FR-3.12` **Order Lifecycle & History**: View order history (`/account/orders`), submit cancellation requests (`PATCH /api/orders/:orderNumber/cancel`), monitor order & shipment status, confirm order receipt (`PATCH /api/orders/:orderNumber/confirm-receipt`), view order confirmation (`/account/orders/[orderNumber]`).

#### Feature 4: E-Wallet API Processing (`FR-4.1` – `FR-4.12`)
- `FR-4.1` **Payment Method Selection**: Select `GCash`, `Maya`, or `PayPal` (plus `GrabPay`).
- `FR-4.2` & `FR-4.3` **Payment Request & Link/QR Generation**: Sends order reference and amount to sandbox API (or built-in sandbox adapter) and returns checkout URL + simulated QR code payload.
- `FR-4.4` – `FR-4.6` **Payment Processing, Verification & Status Update**: Completes payment in sandbox environment, verifies via webhook/callback, updates `Order`, `Payment`, and `SellerOrder` slices to `PAID`.
- `FR-4.7` **Payment Failure Handling**: Handles failed, expired, or cancelled payments (`POST /api/payments/fail-session`) with clear user messaging and retry option.
- `FR-4.8` & `FR-4.9` **Payment Reference Recording & Confirmation**: Records provider, reference number, amount, timestamp, and displays confirmation screen.
- `FR-4.10` **Duplicate Payment Prevention**: Idempotency keys and status guards prevent double payment processing.
- `FR-4.11` **Payment History**: Authorized users view payment transaction records.
- `FR-4.12` **Payment Simulation**: Authorized demonstration feature (`POST /api/payments/simulate`) when sandbox API is unavailable.

#### Feature 5: Seller Management & Store Operations (`FR-5.1` – `FR-5.13`)
- `FR-5.1` & `FR-5.2` **Seller Dashboard & Store Profile**: Store overview, update store name, logo, description, contact info, and identification details.
- `FR-5.3` – `FR-5.7` **Catalog & Stock Operations**: Create, edit, archive products; manage variants (sizes, colors, SKUs); view and adjust stock quantities with reason.
- `FR-5.8` – `FR-5.12` **Seller Order Fulfillment**: View own order slices and customer delivery details; **acknowledge/accept paid orders (`CONFIRMED` / `PREPARING`)**; update packing status; enter courier and tracking number (`SHIPPED`) and hand over to delivery personnel; or cancel with reason and auto-restore stock.
- `FR-5.13` **Sales Monitoring**: View gross sales, platform fee deductions, net earnings, payouts, and order history.

#### Feature 6: Inventory Management (`FR-6.1` – `FR-6.11`)
- `FR-6.1` – `FR-6.3` **Inventory Dashboard & Variant Monitoring**: View all products across sellers, variant stock by size/color, low-stock and out-of-stock counts.
- `FR-6.4` **Incoming Stock Recording**: Record newly received footwear stock (`POST /api/inventory/incoming`).
- `FR-6.5` **Outgoing Stock Recording**: Record stock reductions from sales or authorized outgoing dispatches (`POST /api/inventory/outgoing`).
- `FR-6.6` **Stock Adjustment**: Manual stock correction with recorded reason (`PATCH /api/inventory/variants/:id/adjust`).
- `FR-6.7` & `FR-6.8` **Low-Stock Identification & Availability Updating**: Flag variants `<= lowStockThreshold` and automatically/manually update variant/product availability.
- `FR-6.9` & `FR-6.10` **Movement History & Inventory Reporting**: Full filterable ledger of `StockMovement` entries and exportable/viewable inventory summary report (`GET /api/inventory/report`).
- `FR-6.11` **Inventory Access Control**: Restricted to `INVENTORY_MANAGER` and `ADMIN`.

#### Feature 7: Delivery and Shipment Management (`FR-7.1` – `FR-7.11`)
- `FR-7.1` – `FR-7.3` **Delivery Dashboard & Assignment Viewing**: View shipments, customer delivery address, contact details, and package items.
- `FR-7.4` & `FR-7.5` **Assignment Acceptance & Package Collection**: Accept delivery assignment (`PATCH /api/delivery/shipments/:id/accept`) and confirm package collection from seller (`PATCH /api/delivery/shipments/:id/collect`).
- `FR-7.6` – `FR-7.9` **Status Updates, Tracking & Proof of Delivery**: Update statuses (`PREPARING`, `SHIPPED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`), upload proof of delivery URL/photo and recipient acknowledgment (`PATCH /api/delivery/shipments/:id/status`).
- `FR-7.10` **Failed Delivery Recording**: Record failed delivery attempt with reason (`Incorrect Address`, `Recipient Unavailable`, `Damaged Package`, `Rejected`) setting status to `FAILED` / `RETURN_PENDING`.
- `FR-7.11` **Shipment History**: Maintain timestamped log of every shipment status transition.

#### Feature 8: Customer Support Management (`FR-8.1` – `FR-8.11`)
- `FR-8.1` – `FR-8.3` **Support Dashboard & Ticket Creation**: Shoppers submit inquiries, complaints, cancellation requests, return requests, or refund requests (`POST /api/support/tickets`), generating a tracked support ticket.
- `FR-8.4` – `FR-8.6` **Customer/Order Inspection & Inquiry Response**: Support personnel inspect linked customer, order, payment, and shipment records, and post responses (`POST /api/support/tickets/:id/messages`).
- `FR-8.7` – `FR-8.9` **Cancellation, Return & Refund Handling**: Process eligible order cancellations (restoring stock), approve/coordinate product returns, and review/escalate refund requests to Finance (`PATCH /api/support/tickets/:id/action`).
- `FR-8.10` & `FR-8.11` **Ticket Status & History**: Update ticket statuses (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) and preserve full message and resolution audit history.

#### Feature 9: Financial Management (`FR-9.1` – `FR-9.11`)
- `FR-9.1` – `FR-9.4` **Finance Dashboard, Transaction Verification & Completed Orders**: Monitor all e-wallet transactions, verify payment references (`PATCH /api/finance/payments/:id/verify`), and inspect paid orders.
- `FR-9.5` – `FR-9.7` **Revenue, Platform Fee & Seller Earnings Calculation**: Compute gross sales revenue, platform service fees (based on configured fee `%`), and net seller earnings per seller and across the marketplace.
- `FR-9.8` **Seller Payout Recording**: Record or simulate seller payout disbursements (`POST /api/finance/payouts`).
- `FR-9.9` **Refund Monitoring & Execution**: Monitor pending/approved/completed refunds and record refund transactions (`POST /api/finance/refunds/:ticketId/process`).
- `FR-9.10` & `FR-9.11` **Financial Reporting & Ledger History**: Generate comprehensive financial reports and maintain historical transaction records (`GET /api/finance/reports`).

#### Feature 10: Administrator and Platform Management (`FR-10.1` – `FR-10.10`)
- `FR-10.1` **Administrator Dashboard**: High-level KPIs across users, sellers, products, orders, payments, tickets, and finances.
- `FR-10.2` & `FR-10.4` **User Account & Role Management**: View all users, change user roles across all 7 roles (`PATCH /api/admin/users/:id/role`), and activate/deactivate/suspend accounts (`PATCH /api/admin/users/:id/status`).
- `FR-10.3` **Seller Verification Management**: Review seller identification details and approve/reject/suspend sellers.
- `FR-10.5` – `FR-10.7` **Product, Order & Payment Monitoring**: Full visibility and override controls across all products, orders, shipments, and payment logs.
- `FR-10.8` **System Activity Logging**: Immutable audit trail (`AuditLog`) of all sensitive actions across roles.
- `FR-10.9` **System Configuration**: Manage platform settings (`platformFeePercent`, `lowStockThreshold`, `shippingFeeCentavos`, `freeShippingThresholdCentavos`, `enabledPaymentMethods`) plus read-only masked environment secret inspection.
- `FR-10.10` **Report Viewing**: View overall marketplace operational and financial summaries.

---

## 4. Implementation Vertical Slices

| Slice | Scope | Key Deliverables |
|---|---|---|
| **Slice A** | **Data Foundation & 7-Role Auth** | Prisma schema with 7 roles, account status, seller identification, shipments history, support tickets/messages, seller payouts, product reviews, platform config; additive migration & seed with demo accounts for all 7 roles. |
| **Slice B** | **Storefront, Multi-Seller Filtering & Reviews** | Seller filter, size/color/price filters, fixed price sorting, seller identity badges on cards & PDP, customer product/seller reviews. |
| **Slice C** | **Cart, Resilient E-Wallet Sandbox & Order Lifecycle** | Interactive e-wallet method selector (`GCash`, `Maya`, `PayPal`), built-in Sandbox Checkout & QR Code modal when offline/no API key, Demo Simulate Payment, Shopper Order Detail page (`/account/orders/[orderNumber]`), Receipt Confirmation, Cancel/Return/Refund request submission. |
| **Slice D** | **Seller Portal Enhancements** | Store profile & identification management, Acknowledge/Accept Paid Order (`CONFIRMED`/`PREPARING`), Packing & Shipment handoff, Seller Earnings & Platform Fee breakdown. |
| **Slice E** | **Inventory Manager Portal (`/inventory`)** | Inventory dashboard, seller/variant stock table, Incoming Stock form, Outgoing Stock form, Manual Adjustment, Low-Stock alerts, Availability toggle, Movement History, Inventory Report. |
| **Slice F** | **Delivery Personnel Portal (`/delivery`)** | Assigned shipments dashboard, Accept Assignment, Confirm Collection from Seller, Status progression (`SHIPPED` → `IN_TRANSIT` → `OUT_FOR_DELIVERY` → `DELIVERED`), Proof of Delivery upload, Failed Delivery & Return initiation, Shipment History timeline. |
| **Slice G** | **Customer Support Portal (`/support`)** | Ticket queue (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), customer/order/payment/shipment inspector, Inquiry response thread, Cancellation processing, Return coordination, Refund approval & escalation to Finance. |
| **Slice H** | **Finance Officer Portal (`/finance`)** | Financial KPI dashboard, E-Wallet transaction verification, Revenue / Platform Fee / Net Seller Earnings calculator, Seller Payout recording/simulation, Refund transaction processing, Financial Report generator. |
| **Slice I** | **Administrator Governance (`/admin/dashboard`)** | 7-Role User & Permission Manager, Account Status toggles, Seller ID verification, Platform Settings configuration form, System Audit Logs, Marketplace Reports. |
| **Slice J** | **Diagrams, Documentation & Verification** | Synchronized Level 0/1/2 DFDs & ERD, updated `contents/documentation/*`, automated functional/security/E2E tests passing 100%. |

---

## 5. Definition of Done (DoD)

- [ ] `skill/SKILL UPDATE.md` and `skill/SKILL.md` updated to reflect the complete 22-page `source/IPT.pdf`.
- [ ] All **7 user roles** (`CUSTOMER`, `SELLER`, `ADMIN`, `INVENTORY_MANAGER`, `DELIVERY_PERSONNEL`, `CUSTOMER_SUPPORT`, `FINANCE_OFFICER`) seeded with working demo credentials and accessible via 1-click Demo Role Switcher on `/account/login`.
- [ ] All **10 Functional Requirement Feature Sets** (`FR-1.1` through `FR-10.10`) and **36 Non-Functional Requirements** (`NFR-1` through `NFR-36`) implemented, traced, and verified.
- [ ] Zero bugs, zero duplicate declarations, zero broken links (`/account/orders/[orderNumber]`, `/account/profile`, `/inventory`, `/delivery`, `/support`, `/finance`, `/admin/dashboard`, `/seller/dashboard` all render and function properly).
- [ ] Automated unit, security, and live API integration tests pass 100%.
- [ ] All DFDs, ERD, sitemap, and documentation under `contents/` updated to match the exact implementation.
