---
name: stride-shoe-ecommerce
description: Builds, tests, and documents a complete motion-driven shoe e-commerce website (STRIDE) with a secure backend, relational database, server-verified payments, admin dashboard, DFD/ERD documentation, and test reports. Use when asked to build, extend, or audit the STRIDE / Stridera footwear store, or when a `source/` folder with product images, logos, and initial UI designs is provided as the starting basis.
---

# STRIDE: Source-Based Full-Stack Shoe E-Commerce

## 0. How to use this skill

Run this skill inside the project workspace (AntiGravity). Work through the phases in order and keep a visible task list and artifacts as you go. Do not stop at a static prototype: the result must be a working, tested application.

**Governing sequence:**
INSPECT SOURCE → ANALYZE → DOCUMENT GAPS → DESIGN → IMPLEMENT → TEST → DELIVER DOCS

## 1. Role

Act as a Senior Full-Stack Engineer, UI/UX Designer, Database Architect, Security Engineer, and QA Engineer.

- Project name: **STRIDE** (working title). The supplied brief is called "Stridera"; treat these as the same project and record the naming decision in `assumptions-and-gaps.md`.
- Structural/usability reference: Nike Philippines (https://www.nike.com/ph/) for navigation, discovery, PDP, and cart flow only.
- Never copy Nike's logos, assets, text, or exact layouts. Build an original identity.

## 2. The `source/` folder: a BASIS, not the whole reference

The `source/` folder holds supplied **product images, logos, and initial UI designs** (and may include the IPT/Stridera brief PDF). Treat it as the **starting baseline**.

**Rules**
1. **Inspect it first.** List every file, open and read each one (documents, images, design screens). A visible filename is not proof of review.
2. **Use it as the foundation:** reuse supplied logos, product images, color/typography cues, and layout ideas wherever suitable and authorized.
3. **Do not be limited by it.** Where the source is incomplete, outdated, low-quality, or inconsistent with the requirements in this skill, improve on it: extend the UI, add missing pages and states, generate placeholder content, and refine the design system. Mark anything you add or change as *Inferred*, *Recommended*, or *Generated* (never present it as source-provided).
4. **Priority when sources disagree:** explicit project requirements (this skill + the supplied brief) > supplied design/asset files > Nike PH structural reference > your preferences. Never silently replace an explicit requirement with a personal preference.
5. **Read-only.** Never delete, rename, overwrite, or reorganize files in `source/`. Create derived copies (resized, compressed, cropped, converted) in the app's asset directory and record the original → derived mapping.
6. **Never expose** `source/` documents through public routes, and never copy credentials from it into code or docs.
7. If `source/` is empty or unreadable, say so, proceed with clearly labeled provisional assumptions, and do not claim the app is source-based.

### Known baseline from the supplied brief (IPT.pdf, "Stridera")
Treat as **source-defined** unless contradicted:
- Prototype shoe store with e-wallet sandbox payments (GCash, Maya, or PayPal sandbox; PayMongo is a recommended PH option).
- Users: **Shopper** and **Administrator/Presenter**.
- Flow: Browse → Select Options (category, size, color) → Cart → E-wallet Checkout → Success.
- Functional: category browsing; variant picker (sizes US 7-10, colors); live price/subtotal updates; cart summary with size/color; payment method chooser; "Pay Now" creates sandbox payment URL/QR; payment confirmation flips order PENDING → PAID via server-verified callback; "Order Confirmed!" page.
- Non-functional: fast and simple UI; sandbox only (no real money); **graceful fallback** "Simulate Payment Success" button if the sandbox is down (must be admin/demo-mode gated, never available in production).
- MoSCoW: Must = product gallery by category, attribute selectors, cart + totals, e-wallet API call, order status confirmation. Should = out-of-stock disabling, demo fallback, user accounts, admin order dashboard. Could = multiple gateways, search, reviews, email receipt. Won't = live money/card storage, logistics APIs, coupon engine, multi-currency.

### Reconciling the brief with the full scope below
The brief is a lean prototype; this skill asks for a fuller store. Resolve as follows and document in `assumptions-and-gaps.md`:
- Keep every **Must/Should** from the brief intact.
- Treat the brief's **Won't Have** items as out of scope **unless** a section below explicitly requires them (e.g., the brief excludes a "complex coupon engine", but this skill requires basic promotion/discount rules: implement a *simple* promo-code rule, not tiered rewards or flash-sale timers; log this as a *Conflicting → resolved* item).
- Shipping: brief excludes third-party logistics APIs. Use the **manual fulfillment workflow** (configurable shipping fee + tracking fields) and do not claim live courier integration.
- Never process real money or store raw card data.

## 3. Required directory structure

Adapt to the existing repo; preserve working code and conventions. Default layout:

```text
STRIDE/
├── source/                  # READ-ONLY supplied materials
│   ├── documents/  content/  assets/(images, product-images, logos, icons, fonts)
│   ├── design-references/(screenshots, wireframes, ui-ux-guidelines)
│   └── README.md
├── contents/                # generated docs only (no runtime code)
│   ├── documentation/
│   │   ├── source-inventory.md
│   │   ├── project-analysis.md      # includes traceability matrix
│   │   ├── requirements.md
│   │   ├── assumptions-and-gaps.md
│   │   ├── design-system.md
│   │   └── implementation-notes.md
│   ├── diagrams/ (dfd-level-0.mmd, dfd-level-1.mmd, dfd-level-2-checkout.mmd,
│   │              dfd-level-2-inventory.mmd, dfd-level-2-fulfillment.mmd, erd.mmd)
│   ├── wireframes/  generated-content/  test-reports/  README.md
├── frontend/  backend/
├── database/ (migrations/, seeds/)
├── tests/
├── .env.example  .gitignore  README.md
```

## 4. Phases (execute in order)

### Phase 1: Discovery and source analysis
1. Inspect the project directory: framework, runtime, dependencies, DB, existing features. Extend working code rather than rebuilding.
2. Create `contents/documentation/source-inventory.md`: for each file record relative path, type, purpose, whether successfully inspected, what depends on it, and extraction issues.
3. Create `project-analysis.md`: objectives, users, catalog needs, pages, product/asset needs, UI/animation guidance, business rules, DB/integration needs, security/accessibility, test/deploy expectations. Include the **traceability matrix** (columns: Requirement ID | Requirement | Source reference (file + page/section) | Classification | Affected component | Implementation status | Test reference).
4. Create `assumptions-and-gaps.md` classifying each finding as **Source-defined / Inferred / Missing / Conflicting / Recommended**, with a chosen default for each gap.
5. Audit supplied images: usable resolution, consistent backgrounds, licensing. Note any that need replacement and generate or source properly licensed substitutes, clearly labeled.

### Phase 2: System analysis
- `requirements.md` (functional + non-functional).
- Sitemap and user navigation flow.
- **DFDs (Mermaid `.mmd`)**, consistent with the real code/DB:
  - **Level 0:** Process 0 "Shoe E-Commerce System"; entities: Customer, Administrator, Payment Gateway, Shipping Provider, Email/Notification Service.
  - **Level 1:** 1.0 Account Mgmt, 2.0 Catalog & Search, 3.0 Cart & Checkout, 4.0 Payment & Order Processing, 5.0 Fulfillment & Notifications, 6.0 Inventory & Admin. Stores: D1 Users/Addresses, D2 Products/Variants, D3 Inventory, D4 Carts/Items, D5 Orders/Items, D6 Payment Transactions, D7 Shipments/Tracking, D8 Discounts/Promotions, D9 Wishlist (if implemented).
  - **Level 2:** (a) Checkout & payment: receive request → validate customer/address → revalidate cart/stock → compute trusted totals → create pending order → initiate payment → receive/verify result → finalize order + inventory → confirm. (b) Inventory: receive update → authorize admin → update variant stock → record movement → check availability → return status. (c) Fulfillment: retrieve eligible order → prepare shipment → submit to provider (or manual) → save tracking → update status → notify.
  - DFD rules: labeled directional arrows; entities/processes/stores distinct; levels balanced; data stores accessed only via processes; no raw card numbers/CVV anywhere; include failure flows (payment rejection, insufficient stock, failed notification).
- **ERD + SQL migrations** (see Section 6).

### Phase 3: UI/UX
- Start from the supplied initial UI design and logo in `source/`; refine and extend into a full high-fidelity system (don't merely trace the screenshots).
- Define brand identity and **design tokens** (color, type, spacing, radii, shadows, container widths, animation timing) in `design-system.md` and as CSS variables.
- Low-fidelity wireframes in `contents/wireframes/`; high-fidelity designs for every page; motion spec; responsive and accessibility spec.
- Visual direction: cinematic footwear photography, large editorial typography, minimalist asymmetric layouts, generous whitespace, product-focused compositions. White/warm off-white background, near-black text, light-gray surfaces, one carefully chosen original accent (electric lime or vivid orange unless the source logo/palette dictates otherwise: then **the source palette wins**). Bold geometric display font + readable body font.
- Strong-contrast buttons, clear labels, visible focus states, consistent sizing.

### Phase 4: Foundation
Project config, DB + migrations, API infrastructure, reusable components, authentication, role permissions.

Architecture layers: presentation → routing/controllers → services (business logic) → repositories (data access) → database → external provider adapters.

### Phase 5: Commerce features
Catalog/search, PDP + variants, cart, checkout, orders, payments, inventory, customer accounts, admin.

### Phase 6: Motion and polish
See Section 7.

### Phase 7: Verification
Run functional, security, and UI tests (Section 9). Fix defects. Verify DB consistency, payment and stock integrity.

### Phase 8: Handover
Update DFDs/ERD to match implementation, finalize docs, setup + deployment instructions, final report.

## 5. Required website structure

**Homepage:** announcement bar; main nav + logo; hero (headline, description, CTA, shoe image); new arrivals; trending/bestsellers; shop by category; Running/Basketball/Training/Lifestyle collections; promo/editorial banners; recommended products; newsletter (optional); footer (customer service, policies, social).

**Shop / listing:** searchable catalog; category/collection nav; filters for audience, shoe type, size, color, price, availability; sort (newest, price, popularity); product card (image, name, category, price, sale price); pagination or proper load-more; empty/loading states; clear-filters; mobile filter drawer; **shareable URL query params**. Filters must query real data.

**Product detail:** gallery + thumbnails; name + SKU; current/previous price (only for valid discounts); color variants; size selector; **per-variant stock**; description/features; delivery/returns info; quantity; add-to-cart; wishlist (if supported); related products; clear feedback for invalid selection and unavailable sizes. Size/variant required before add-to-cart.

**Cart:** image, name, size, color, unit price, quantity adjust, remove, subtotal, discount/shipping estimate/total, continue shopping, checkout CTA, empty state. **Revalidate prices, discounts, stock server-side; never trust browser totals.**

**Checkout (step-by-step):** customer info → shipping address → delivery method → order review → payment method (e-wallet chooser per brief) → payment result/confirmation. Guest checkout allowed, with optional account creation. Validate everything on the backend. **Never mark an order PAID from a browser redirect or client message.**

**Customer account:** register/login/logout, profile, saved addresses, order history, order details/tracking, wishlist (if supported), password reset, session expiry and account protections.

**Admin dashboard (role-protected):** product CRUD; categories/collections; images/descriptions; size/color variants; inventory; orders; payment status + transaction refs; shipment status; promotions; customer accounts; basic sales/inventory reports. Admins cannot bypass payment verification or edit transaction records without authorization and audit logging. Include the brief's admin order table (UNPAID/PENDING vs PAID).

## 6. Database

Normalized relational DB (MySQL or PostgreSQL per environment; if none, choose PostgreSQL and document it).

Entities: `users`, `addresses`, `categories`, `products`, `product_variants` (size, color, variant_sku, price_override, stock_quantity, is_active), `product_images`, `carts`, `cart_items`, `orders` (order_status, payment_status, shipping_status, subtotal, discount_total, shipping_fee, grand_total, address snapshot), `order_items` (name/size/color/unit-price snapshots), `payments` (provider, provider_transaction_reference, amount, currency, status, **idempotency_key**, verified_at), `shipments`, `promotions`, `audit_logs`, plus `stock_movements` and `wishlist_items` if implemented.

Rules:
- PKs, FKs, indexes, unique constraints, validation constraints.
- **Money:** DECIMAL or integer minor units (centavos). Never floats.
- Stock is **per variant**. Validate and decrement inside a transaction with row locking or conditional `UPDATE ... WHERE stock >= qty` to prevent overselling.
- Migrations in `database/migrations/`, seed data in `database/seeds/`. ERD in `contents/diagrams/erd.mmd` must match the schema exactly.

## 7. Design, motion, accessibility

**Motion (purposeful, performance-safe):** hero text reveals + product entrance; subtle scroll reveals; product-card image transitions/hover; animated gallery and color-variant switching; smooth mobile nav + desktop dropdowns; cart drawer slide-in + quantity updates; add-to-cart feedback/loading; button press/focus feedback; lightweight page transitions; optional campaign sequences.

- CSS transitions for simple effects; Motion (Framer Motion) or equivalent for React-style frameworks.
- Animate **transform and opacity** only. No layout-thrashing animation, heavy parallax, long blocking transitions, or forced scrolling.
- Do not apply every effect everywhere; motion supports products and navigation.
- **Honor `prefers-reduced-motion`**; every feature must work with motion off.

**Accessibility/UX:** responsive (desktop/tablet/mobile); semantic HTML; labeled forms; keyboard navigation; visible focus; readable contrast; meaningful alt text; clear validation/error text; loading/empty/success/failure states; prevent duplicate purchases; explain unavailable sizes; never rely on color alone for status.

**Performance:** responsive images, modern formats (WebP/AVIF), lazy-load below the fold, reserve layout space, caching, DB indexes, pagination, minimal dependencies.

## 8. Backend, payments, shipping, security

**API:** validate all input; parameterized SQL or trusted ORM; pagination + result limits; centralized error handling; consistent response envelope; documented methods, fields, responses, error codes (in `contents/documentation/`); transactional order + inventory writes; idempotent payment callbacks and checkout submissions; secrets only in env vars.

**Payments (sandbox first):**
- Evaluate PayMongo or another PH gateway (GCash, Maya, GrabPay, online banking, cards) and follow official docs. Do not invent credentials or provider responses.
- Flow: create pending order → create payment session **server-side** → redirect/present provider UI → verify result server-side → verify webhook signature → idempotent processing → record provider ref + status → handle success, failure, cancel, timeout, duplicates.
- Secret keys never reach the frontend.
- **Demo Safety Fallback** (from the brief): a "Simulate Payment Success" action that runs through the *same* server-side order-finalization path, enabled only when `DEMO_MODE=true`, restricted to admin/presenter, audit-logged, and clearly labeled as simulated.
- Do not claim real payments/shipping work until configured and tested.

**Shipping:** provider integration only if credentials exist; otherwise manual fulfillment (configurable fees, tracking fields, status updates, notifications).

**Security:** modern password hashing (argon2/bcrypt); secure sessions/cookies; server-side authZ and role checks; CSRF; XSS output encoding; SQL injection protection; rate limiting on login and sensitive routes; safe upload validation; mass-assignment/privilege-escalation protection; minimal PII; retention/deletion procedure; audit logs for admin actions; least-privilege DB accounts; never log passwords, tokens, CVVs, or unneeded PII; never store card numbers/CVV.

## 9. Content and testing

**Seed data:** small, realistic catalog covering running, lifestyle sneakers, basketball, training, casual. Prefer products and images from `source/product-images`; fill gaps with original or properly licensed assets. Realistic sizes (e.g., US 7-12), colors, stock, descriptions, PHP pricing. Label demo data clearly; never present fictional products, discounts, reviews, or availability as real. Do not hotlink Nike assets.

**Tests** (store in `tests/`, report in `contents/test-reports/`). For each test record: preconditions, steps, expected result, actual result, pass/fail. **Never report an unexecuted test as passed.**

- *Functional:* register/login/logout/reset; browse/search; filter/sort; variant selection; cart add/remove/qty; price/discount math; checkout validation; payment success/rejection/cancel/duplicate callback; order creation/history; stock deduction/restoration; admin CRUD + access control; shipment updates/notifications.
- *Security:* unauthorized admin access; SQL injection; manipulated prices; invalid quantities/variants; duplicate submissions; forged payment callbacks; XSS/CSRF; exposure of config or transaction data; demo-fallback unavailable when `DEMO_MODE` is off.
- *UI:* responsive layouts; nav links; keyboard access; reduced-motion; form validation; loading/error states; browser console errors. Use the browser tool to verify visually and capture screenshots as evidence.

## 10. Execution rules (non-negotiable)

1. Inspect before coding; preserve working code and conventions.
2. Choose secure, sensible defaults for unspecified decisions and document them; don't stall on minor choices.
3. Test each major feature before moving on; verify every link, button, form, filter, and nav control actually works.
4. No essential feature left as TODO, static mockup, or dead button.
5. Never claim completion without implementation **and** test evidence. A requirement is "verified" only with evidence.
6. Keep DFDs, ERD, schema, UI, backend, and tests consistent with each other and with the traceability matrix. Update the matrix as you build.
7. Keep generated documentation in `contents/`; keep runtime code out of `contents/`.

## 11. Deliverables checklist

- [ ] Source inventory, project analysis + traceability matrix, assumptions-and-gaps
- [ ] Requirements, sitemap/user flow
- [ ] Architecture diagram; DFD L0, L1, L2 (checkout, inventory, fulfillment); ERD + SQL migrations
- [ ] Wireframes, high-fidelity UI, design system, motion spec
- [ ] Frontend, backend API, DB integration, seeds
- [ ] Customer and admin workflows; payment and shipping design
- [ ] Validation, security, error handling
- [ ] Test cases + executed test report (pass/fail/untested clearly separated)
- [ ] `README.md`, `.env.example` (no real secrets), install/config/build/test commands, deployment + HTTPS guide, backup/recovery, troubleshooting

## 12. Acceptance criteria

Complete only when: all major pages are responsive; data comes from the real DB; search, filters, size selection, and sorting work; cart persists per design; server-side validation protects totals and stock; checkout handles success and failure; payment status is server-verified; orders and inventory stay consistent under repeated requests; customer and admin permissions are enforced; schema/ERD and DFDs match the implementation; animations are smooth, purposeful, and accessible; no critical security issue or broken essential control remains; docs are complete; test results honestly separate passed, failed, and untested.

## 13. Final report format

Provide: summary of the system; tech stack and architectural decisions; implemented features; folder structure; DFD/ERD locations; DB setup; API and env configuration; test results; security and accessibility notes; **what was taken from `source/` vs. what was extended or generated**; known limitations; recommended next steps.

Prioritize correctness, transaction integrity, maintainability, and usability over complexity.
