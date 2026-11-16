---
name: stridera-revision-update
description: Apply the revised Stridera (STRIDERA) specification to the existing footwear e-commerce prototype — multi-seller marketplace, persistent sessions for Shopper/Seller/Admin, seller portal (catalog, inventory, order fulfilment, product-metrics dashboard) and admin console (seller approval, roles, API keys, webhooks, health logs, platform-wide seller analytics). Use this skill whenever the user mentions the Stridera revision, updating or upgrading the Stridera project, adding seller accounts or a seller dashboard, admin analytics, persistent login, or the revised IPT PDF, even if they never say "skill". It extends the working codebase instead of rebuilding it, and ends with migrations, traceability, updated diagrams and an honest test report.
---

# Stridera Revision Update

Stridera started as a single-store footwear demo: a Shopper browses, picks size and color, pays through an e-wallet sandbox, and an Administrator watches orders flip from PENDING to PAID. The revision turns it into a **multi-seller marketplace** with three first-class roles (Shopper, Seller, Administrator), **persistent sign-in** for all of them, a **seller portal** with product-performance metrics, and an **admin console** with platform-wide seller analytics.

Your job is to apply that revision to the code that already exists. The revised PDF is the source of truth. The original PDF is only a baseline for seeing what changed. Everything that already works (browse, variants, cart, e-wallet sandbox, status flip, "Simulate Payment Success" fallback) must still work when you finish, because the live presentation depends on it.

## Operating principles (and why)

- **Extend, do not rebuild.** A working checkout is the most valuable asset in this project. Rewriting it risks the demo. Add seams around it.
- **The spec beats your preferences.** Never silently swap an explicit requirement for a design taste. When the spec is ambiguous or silent, use the defaults in Phase 2, and write every decision to `assumptions-and-gaps.md`.
- **Authorization lives on the server.** A seller dashboard that merely hides buttons is not secure. Every seller or admin action must be checked against the session on the server.
- **Sandbox only.** No real money, no live keys, no stored card data. This is a stated Non-Functional Requirement and a Won't-Have.
- **Evidence before claims.** A requirement is "verified" only when a test you actually ran proves it. Unrun tests are reported as "Not run", never as passed.
- **Stay inside the revision.** Do not add couriers/logistics APIs, coupons, multi-currency, or live payments (Won't Have). Do not invent new roles.

## Phase 0 — Discovery (read before you write)

1. Inspect the repository: framework and runtime (expected: Flask + SQLite, but verify rather than assume), models/schema, routes, templates, static assets, auth mechanism, payment module, seed data, migrations, tests, README.
2. Read the **revised PDF in full** (sections A–F) and the original PDF for the diff. Do not rely on file names or partial previews.
3. Check what earlier drafts left in the repo. Earlier specs may have introduced extra staff roles (e.g. Inventory Manager, Delivery Personnel, Customer Support, Finance Officer) or brand-restricted sellers. The revised PDF names only Shopper, Seller and Administrator. Keep any working extra functionality running, mark it **beyond-spec** in the gaps document, do not extend it, and do not make new features depend on it. Ask the owner (in the final report) whether to retire it.
4. Take a safety net: copy the SQLite database file to `backups/` with a timestamp, run the existing tests (or smoke-test the main flow by hand if there are none), and record the baseline result.
5. Write `docs/revision/baseline-audit.md`: what already exists for each REV item below (Present / Partial / Missing), with file paths.

If the repo uses another documentation layout (for example `contents/documentation/`), follow it and note that in the audit.

## Phase 1 — What the revision changes

| ID | Revision item | PDF source | Work |
|---|---|---|---|
| REV-01 | Multi-seller marketplace; every product belongs to a seller | A; F (Product.Seller_ID) | Add seller ownership; storefront shows all sellers' active products together |
| REV-02 | Persistent authentication for all roles; user returns to their own UI | A; B.1–B.3; E.1 Must Have; NFR Data Integrity | Token-based persistent sessions, role-aware landing |
| REV-03 | Seller role and portal | B.3; F (Role) | Seller registration, admin approval, seller UI |
| REV-04 | FR-4.1 Product catalog management: add, edit, archive with title, description, base price, images (plus categories, sizes, colors from B.3) | C Feature 4 | Seller product editor with variants and image upload |
| REV-05 | FR-4.2 Stock tracking: real-time decrement on successful payment, manual adjustment | C Feature 4 | Transactional, idempotent decrement; seller stock controls |
| REV-06 | FR-4.3 Merchant order overview filtered by PENDING / PAID / SHIPPED / CANCELLED; update fulfilment status | C Feature 4; B.3 | Seller order list, filters, fulfilment actions |
| REV-07 | FR-4.4 Product metrics: high-selling vs low-selling | C Feature 4; D | Seller dashboard with defined metrics |
| REV-08 | FR-5.1 Admin analytics for all sellers: performance, sales volume, activity | C Feature 5; E.1 | Platform-wide analytics dashboard |
| REV-09 | Admin approves seller registration; manages user roles and permissions | B.2 | Approval queue, user/role management with safeguards |
| REV-10 | Admin configures API keys; monitors payment webhooks and system health logs | B.2 | Settings, webhook monitor, health and log pages |
| REV-11 | Original admin duties stay: view orders (UNPAID vs PAID), add/modify mock inventory | B.2; E.2 Should Have | Keep and re-scope across all sellers |
| REV-12 | Authorization checks for seller store operations | C NFR Data Integrity & Security | Central role and ownership enforcement |
| REV-13 | Proposed data model (User, Product, Product_Variant, Order, Order_Item, Payment_Transaction) | F | Migration to match, plus additive columns from Phase 3 |
| REV-14 | Sellers work independently of the admin once approved | D | No admin step needed for listing, stock or fulfilment |
| REV-15 | Unchanged requirements stay working: FR-1.1–FR-3.3, Should/Could/Won't lists, sandbox mode, Simulate Payment Success fallback | C, E | Regression suite |

Create the traceability matrix `docs/revision/traceability.md` with columns: Requirement ID | Requirement | PDF section | Classification (source-defined / inferred / recommended) | Affected pages, APIs, tables | Status (planned / in progress / implemented / verified) | Test IDs. Update it as you go. Mark "verified" only with test evidence.

## Phase 2 — Decisions already made (apply these; document them)

The revised PDF leaves several gaps. These defaults keep you moving without guessing. Record each in `assumptions-and-gaps.md` as Source-defined, Inferred, Conflicting, Missing or Recommended.

**D1 — Order status vocabulary (conflict).** The PDF says UNPAID vs PAID for the admin and PENDING / PAID / SHIPPED / CANCELLED for sellers. Use one canonical set: `PENDING`, `PAID`, `SHIPPED`, `CANCELLED`. The admin UI may label PENDING as "Unpaid". Map any old values in the migration.

**D2 — One order can span several sellers (gap).** A shopper's cart may hold shoes from different sellers, paid once (one Payment_Transaction per order, as the data model says). Shipping is per seller, so a single `SHIPPED` flag on Order cannot work: seller A shipping would mark seller B's shoes shipped. Add `fulfillment_status` (`PENDING`, `SHIPPED`, `CANCELLED`) to Order_Item, and derive Order_Status: PENDING until payment is confirmed; PAID once paid; SHIPPED when every non-cancelled item is shipped; CANCELLED when all items are cancelled. Show "Partially shipped" as a derived label. A seller's view of an order is the slice of items that belong to them, with this status: order PENDING → PENDING; item cancelled or order cancelled → CANCELLED; item shipped → SHIPPED; otherwise PAID. Sellers may mark only their own items SHIPPED, and only when the order is PAID.

**D3 — "Signed-in sellers" (ambiguity).** FR-5.1 and the Admin Dashboard Must-Have say "all signed-in sellers". Read this as **all approved sellers**, with an "Online now" badge (session seen within the last 10 minutes) and a "Last active" time. This satisfies both readings. It requires `last_seen_at`, updated at most once per minute per session.

**D4 — Persistent sessions.** Keep the `Session_Token` column the spec requires. Generate an opaque random token (`secrets.token_urlsafe(32)`), store only its SHA-256 hash, and send the raw token in an HttpOnly, SameSite=Lax cookie that expires in 30 days (set `Secure` through a config flag so localhost demos still work). Rotate the token on login, clear it on logout, and invalidate it on password change, suspension or role change. On every request a loader resolves the cookie to the user. Returning visitors land on their own UI: Shopper → storefront, Seller → seller dashboard, Admin → admin console. A seller or shopper token must never open admin routes. One token per user means one active device at a time; log that limitation and mention a `user_sessions` table as a Recommended upgrade. Login should say "Keep me signed in" and default it to on, since the spec treats persistence as the norm.

**D5 — Seller onboarding.** Add `account_status`: `PENDING_APPROVAL`, `ACTIVE`, `SUSPENDED`. Sellers self-register as PENDING_APPROVAL and can sign in only to an "awaiting approval" screen. The admin approves, rejects or suspends. Only ACTIVE sellers can publish listings. When a seller is suspended, hide their products from the storefront but keep their orders and history intact. Shoppers are ACTIVE on registration. Admin accounts are never self-registered; seed them through a CLI command or environment variables.

**D6 — Role and permission management safeguards.** The admin can change roles and status. Refuse to demote or suspend the last remaining admin and refuse self-lockout. Write every change to `audit_logs` (actor, action, entity, timestamp, safe metadata, never secrets).

**D7 — API keys, webhooks, health.** Keep secrets out of the browser and the logs. Store settings in a `system_settings` table, encrypted at rest (for example Fernet with a key from an environment variable), displayed masked (last four characters only), and never returned in full by any API. Enforce sandbox mode: reject any key or endpoint the provider marks as live. Record every incoming webhook in `webhook_events` (provider, unique event id, signature_valid, status, received_at, processed_at, error; payload redacted). Reject invalid signatures but still log them. The health page shows: database reachable, sandbox provider reachable, last webhook received, webhook failures in the last 24 hours, recent errors, and whether the demo fallback is enabled.

**D8 — Metric definitions (FR-4.4, FR-5.1).** Count only order items from **PAID or SHIPPED** orders. PENDING and CANCELLED never count, otherwise abandoned carts inflate the numbers. Per product and per variant: units sold, revenue (unit price snapshot × quantity), order count, current stock. Default period 30 days with 7 / 30 / 90 / all-time options, using Asia/Manila for display and UTC for storage. Classification within a seller's ACTIVE products: **High-selling** = top 20% by units (at least one product), **Low-selling** = bottom 20%, **No sales** = zero units in the period. When a seller has fewer than five products, show the ranking without labels. Make the percentage and the low-stock threshold (default 5) named constants. Money must be summed as integer centavos or Decimal; if the codebase stores floats, fix it in the migration when low-risk, otherwise log it as a known risk.

**D9 — Stock decrement (FR-4.2).** Validate stock at checkout, but decrement only when payment is confirmed. Do it in one transaction (in SQLite use `BEGIN IMMEDIATE` and `PRAGMA foreign_keys=ON`) with a conditional update: `UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE variant_id = ? AND stock_quantity >= ?`, and check the affected row count. The webhook handler and the "Simulate Payment Success" button must both call the same `finalize_payment(order_id, provider, reference)` function, which does nothing on a second call. If the conditional update fails because another buyer took the last pair, do not oversell: flag the item `stock_conflict`, surface it to the seller and the admin, and block shipping until resolved. Cancelling restores stock only if it was already decremented. Manual stock adjustment accepts a new absolute quantity or a signed delta, rejects negative results, and logs who changed what.

**D10 — Authorization model.** Build three small pieces and use them everywhere: a login requirement, a role requirement, and an ownership lookup such as `get_owned_product_or_404(product_id, seller_id)`. Take `seller_id` from the session, never from a form field or URL. Return 404, not 403, for another seller's resources so their existence does not leak. Admins may edit any inventory (original admin duty), always with an audit log entry.

**D11 — Archive means soft state.** `Status` is `ACTIVE`, `DRAFT` or `ARCHIVED`. Archived products disappear from the storefront, search and add-to-cart, but their rows are never deleted while any order references them. Checkout validation drops archived or inactive items with a clear message.

**D12 — Product images.** Accept PNG, JPG or WEBP up to 2 MB, validate by content (not only extension), save under randomized file names in a non-executable uploads folder, and cap the number per product. Reuse the existing image handling if there is some.

**D13 — Simulate Payment Success.** Keep it, as required. Gate it behind a `DEMO_FALLBACK_ENABLED` flag plus sandbox mode, make it callable only by the order's owner or an admin, record the payment with provider `SIMULATED`, and write an audit log entry. Simulated payments count in metrics, but analytics should be able to tell them apart.

**D14 — Recommended UX addition.** Show "Sold by {store name}" on product cards and the product page so the multi-seller change is visible to shoppers. Flag it as Recommended.

## Phase 3 — Data model migration

Match the spec's proposed model, then add only the columns and tables below. Everything below the spec columns is **additive** and must be marked Recommended or Inferred in the gaps document.

| Table | Spec columns (required) | Additive |
|---|---|---|
| User | User_ID, Name, Email, Password_Hash, Session_Token, Role (Shopper / Seller / Admin) | account_status, session_expires_at, store_name (sellers), last_login_at, last_seen_at, created_at |
| Product | Product_ID, Seller_ID (FK), Name, Description, Category, Base_Price, Status | created_at, updated_at; `product_images` table for FR-4.1 images |
| Product_Variant | Variant_ID, Product_ID (FK), Size, Color, SKU, Stock_Quantity | UNIQUE(Product_ID, Size, Color), CHECK(Stock_Quantity >= 0), is_active |
| Order | Order_ID, Shopper_ID (FK), Total_Amount, Order_Status, Created_At | updated_at |
| Order_Item | Order_Item_ID, Order_ID (FK), Variant_ID (FK), Quantity, Unit_Price | fulfillment_status, shipped_at, stock_conflict |
| Payment_Transaction | Transaction_ID, Order_ID (FK), Provider, Reference_Number, Payment_Status, Updated_At | UNIQUE(Provider, Reference_Number) |
| audit_logs, webhook_events, system_settings | not in the spec | needed for REV-06, 09, 10 (see D6, D7) |

Suggested indexes: products(seller_id, status), order_items(variant_id), orders(shopper_id, created_at), orders(order_status), webhook_events(event_id UNIQUE).

Migration rules:

- Write a numbered migration script that is safe to run twice, and take the Phase 0 backup first. SQLite cannot alter many constraints in place, so use create-copy-rename for those.
- **Backfill so foreign keys hold:** create a seeded, ACTIVE seller (for example "Stridera Official") and assign every existing product to it; map old order statuses per D1; give existing users the right role; keep the existing admin.
- Provide a seed script with demo data clearly labelled as demonstration data: 1 admin, 3 sellers (2 ACTIVE with different product sets, 1 PENDING_APPROVAL), 3 shoppers, a spread of categories, sizes and colors, and paid, pending, shipped and cancelled orders so both dashboards have something to show. Seeded passwords are for demos only; document them in the README, never reuse them elsewhere.

## Phase 4 — Build order

Build in this order and test after each step. Later steps depend on earlier ones, and a regression is cheapest to catch right after the change that caused it.

1. **Persistent auth (REV-02).** Implement D4. Gate: log in as each role, restart the server, and the stored cookie still resolves to the right user and landing page.
2. **Role enforcement (REV-12).** Build the D10 pieces and apply them to every existing route. Gate: shopper blocked from seller and admin routes, seller blocked from admin routes.
3. **Seller onboarding and approval (REV-03, REV-09).** Seller signup, pending screen, admin approval queue. Gate: a pending seller cannot publish.
4. **Seller catalog (REV-04).** Product list, editor with variants (size, color, SKU, stock), image upload, archive and restore. Gate: a new listing appears in the storefront with working category, size and color filters; archiving removes it.
5. **Storefront integration (REV-01, D14).** Confirm that listing, filters, variant picker, out-of-stock disabling, cart and checkout work with several sellers in one cart.
6. **Payment finalization and stock (REV-05).** Refactor the webhook and Simulate Payment paths into the single `finalize_payment` function (D9). Gate: duplicate calls change nothing; multi-seller orders decrement each seller's variants.
7. **Seller orders (REV-06).** Status filter chips (PENDING, PAID, SHIPPED, CANCELLED), order detail showing only the seller's items, mark-as-shipped per D2. Gate: seller A never sees seller B's items or shopper data beyond what fulfilment needs (recipient, shipping details).
8. **Seller metrics (REV-07).** Dashboard with summary cards (revenue, units, orders, low-stock count), top and bottom products table with High-selling / Low-selling / No sales badges, period selector, and one lightweight chart. Gate: figures match a hand-calculated fixture.
9. **Admin console (REV-09, 10, 11).** Seller approvals, users and roles, all orders with status filter, inventory across sellers, API settings, webhook monitor, health and logs.
10. **Admin analytics (REV-08).** Platform totals and a per-seller table (revenue, units, orders, active listings, low-stock items, fulfilment rate, last active, online badge), period selector, top sellers chart. Gate: platform total equals the sum of seller totals equals the sum over PAID and SHIPPED orders.
11. **Regression and polish (REV-15).** Run the original browse → options → cart → e-wallet → success journey end to end, plus the fallback button.

### UI guidance

You are extending an existing design, so reuse its tokens (color, type, spacing, radii) rather than inventing a second look. The seller portal and admin console are working tools, so favor clarity over decoration.

- Layout: sidebar navigation with the role's sections, a clear page title, summary cards above tables.
- Seller portal screens: Dashboard, Products, Product editor, Inventory, Orders, Store profile.
- Admin console screens: Analytics, Sellers (approval queue), Users and roles, Orders, Inventory, API settings, Webhooks, System health and logs.
- Every list needs an empty state (a brand-new seller has no products or sales), a loading state, and a clear error state.
- Status badges must carry text, not color alone, and meet contrast requirements. Forms need visible labels, inline validation messages and keyboard access.
- Tables must stay usable at 375 px width (stacked rows or horizontal scroll with a visible hint).
- Keep pages light, since the NFR is speed during a live demo: server-rendered pages, minimal JavaScript, no heavy chart library when a small inline SVG or a tiny dependency will do.
- Keep motion minimal and respect `prefers-reduced-motion`.

## Phase 5 — Documentation to update or create

Store under `docs/revision/` (or the repo's existing documentation folder):

- `baseline-audit.md`, `traceability.md`, `assumptions-and-gaps.md` (see above).
- **DFDs in Mermaid**, kept consistent with the code. Level 0: add **Seller** as an external entity (listings, stock updates and fulfilment updates in; metrics and orders out) and extend the Administrator flows (approvals, role changes, API keys in; analytics, webhook and health logs out). Level 1: add processes for Session Management, Seller Operations, and Platform Administration and Analytics, with data stores for sessions and users, products and variants, orders and items, payment transactions, webhook events, settings and audit logs. Level 2: expand "Payment confirmation and stock decrement" (including the duplicate and stock-conflict failure flows) and "Seller fulfilment update". Balance inputs and outputs between levels, and route all data-store access through processes.
- **ERD** in Mermaid matching the migration exactly.
- A route and API table: method, path, allowed roles, request fields, response, errors.
- README additions: environment variables (`.env.example` with no real secrets, including the settings encryption key and `DEMO_FALLBACK_ENABLED`), migration and seed commands, demo accounts per role, how to run the tests.

## Phase 6 — Test plan and execution

Automate with the framework's test client (for Flask, pytest and the Flask test client) where possible. For each test record preconditions, steps, expected result, actual result and status (Pass / Fail / Not run). Fix failures and re-run, and do not hide a failure by deleting its test.

| ID | Check |
|---|---|
| T-AUTH-01 | Login sets the persistent cookie; a new client carrying that cookie lands on the correct UI for each of the three roles |
| T-AUTH-02 | Logout invalidates the token; replaying the old cookie is rejected |
| T-AUTH-03 | Tampered, unknown or expired token is rejected |
| T-AUTH-04 | Suspending a user, changing their role or changing their password invalidates their session |
| T-AUTH-05 | PENDING_APPROVAL seller reaches only the awaiting-approval screen |
| T-RBAC-01 | Shopper gets no access to any seller or admin route |
| T-RBAC-02 | Seller gets no access to any admin route |
| T-RBAC-03 | Seller A cannot view, edit, archive or adjust stock on seller B's product, variant or order items (404) |
| T-RBAC-04 | A forged `seller_id` in a form or query string is ignored |
| T-RBAC-05 | Admin can see and manage all sellers' data, with audit entries |
| T-CAT-01 | Seller creates a product with variants; it appears in storefront search and filters |
| T-CAT-02 | Archived or suspended-seller products vanish from the storefront but stay in order history |
| T-CAT-03 | Duplicate size/color, negative price, negative stock and invalid images are rejected |
| T-CAT-04 | Variant at zero stock is disabled in the picker (existing Should-Have) |
| T-PAY-01 | Confirmed payment moves the order PENDING → PAID and decrements stock exactly once |
| T-PAY-02 | Duplicate webhook or repeated Simulate click changes nothing |
| T-PAY-03 | Two concurrent buyers of the last pair: no oversell, a conflict is flagged |
| T-PAY-04 | Cancelled or failed payment does not decrement stock |
| T-PAY-05 | Forged webhook (bad signature) is rejected and logged |
| T-ORD-01 | Seller's status filters return only their own items in the right status |
| T-ORD-02 | Seller can ship only their own items and only on PAID orders |
| T-ORD-03 | Multi-seller order: shipping one seller's items leaves the other's PAID; derived order status is correct |
| T-ORD-04 | Shopper order history still works |
| T-MET-01 | Seeded fixture yields the expected units, revenue and order count per product |
| T-MET-02 | PENDING and CANCELLED items are excluded from every metric |
| T-MET-03 | High-selling, Low-selling and No-sales labels are assigned per D8, including the under-five-products rule |
| T-MET-04 | Empty state renders for a seller with no products or sales |
| T-MET-05 | Admin platform total = sum of seller totals = sum over PAID and SHIPPED orders |
| T-ADM-01 | Approve, reject and suspend sellers work and are audited |
| T-ADM-02 | Role change works; last admin cannot be demoted or suspended |
| T-ADM-03 | API keys are masked in HTML and JSON, absent from logs and page source, and live-mode keys are rejected |
| T-ADM-04 | Webhook monitor lists valid and invalid events; health page shows real checks |
| T-ADM-05 | "Online now" and "Last active" update with seller activity |
| T-ADM-06 | Simulate Payment Success is blocked when `DEMO_FALLBACK_ENABLED` is off |
| T-REG-01 | Original journey FR-1.1 → FR-3.3 passes end to end |
| T-REG-02 | Variant picker updates sizes and colors; subtotal updates with quantity (FR-1.2, FR-1.3) |
| T-REG-03 | Fallback button completes the demo with the sandbox unreachable |
| T-SEC-01 | SQL injection strings in search, filters and forms are harmless |
| T-SEC-02 | Product titles, descriptions and store names containing script tags are escaped everywhere |
| T-SEC-03 | State-changing requests without a valid CSRF token are rejected (where CSRF protection exists) |
| T-SEC-04 | Upload abuse (wrong type, oversized, path tricks) is rejected |
| T-UI-01 | Seller and admin pages are usable at 375, 768 and 1280 px |
| T-UI-02 | Keyboard-only use works with visible focus; status is readable without color |
| T-UI-03 | Empty, loading and error states exist on every list |
| T-UI-04 | No browser console errors on the main screens |

Manual UI checks (T-UI-*) may be run by hand; mark them as manual and mark anything you could not run as Not run.

## Phase 7 — Final report

Finish with a short report containing:

1. What changed, grouped by REV ID, and what stayed untouched.
2. Migration notes: the backup location, how to run the migration and seed, and how to roll back.
3. Demo accounts (clearly demo-only) and the environment variables required.
4. Test results as Pass / Fail / Not run counts, listing every failure and every unrun test by ID.
5. Decisions made (D1–D14) with anything the owner should confirm, in particular any beyond-spec functionality found in Phase 0.
6. Known limitations (for example single-device sessions, sandbox-only payments, manual refunds) and recommended next steps.

## Definition of done

- Every REV item is implemented, and marked verified only where a passing test backs it.
- All three roles stay signed in across restarts and land on their own UI.
- No seller can touch another seller's data; the admin sees everything.
- Stock and order status stay consistent under repeated or concurrent confirmations.
- Seller metrics and admin analytics reconcile with each other.
- API keys never appear in frontend code, page output or logs.
- DFDs, ERD, routes table and README match the code that was actually built.
- The original demo journey and the fallback button still work.