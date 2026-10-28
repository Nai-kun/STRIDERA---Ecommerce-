# Contents Index — STRIDERA E-Commerce

> This file is the master index for all generated documentation and diagrams in the `contents/` folder.
> Last updated: 2026-10-28 | Branch: `revision/multi-seller`

---

## 📁 documentation/

| File | Description |
|------|-------------|
| [`requirements.md`](documentation/requirements.md) | Full functional (FR-01–FR-17) and non-functional requirements specification |
| [`api.md`](documentation/api.md) | API reference — all endpoints, request/response shapes, auth, error codes |
| [`design-system.md`](documentation/design-system.md) | Visual design tokens, typography, color palette, component patterns |
| [`implementation-notes.md`](documentation/implementation-notes.md) | Architecture, money integrity rules, payment flow, security measures |
| [`source-inventory.md`](documentation/source-inventory.md) | Inventory of all source assets in `source/` |
| [`assumptions-and-gaps.md`](documentation/assumptions-and-gaps.md) | Documented assumptions and gap resolutions |
| [`project-analysis.md`](documentation/project-analysis.md) | Pre-revision project analysis — what existed before the revision |
| [`audit-report.md`](documentation/audit-report.md) | Phase 1 audit: stack detection, routes, models, what works/broken/missing |
| [`traceability-matrix.md`](documentation/traceability-matrix.md) | FR/NFR → implementation file → test → status mapping |
| [`decision-log.md`](documentation/decision-log.md) | 8 key architectural decisions with rationale and consequences |
| [`asset-manifest.md`](documentation/asset-manifest.md) | Source → derived asset tracking (images, logo) |
| [`demo-runbook.md`](documentation/demo-runbook.md) | Step-by-step presenter guide for live demo |
| [`completion-report.md`](documentation/completion-report.md) | Phase 7 final report — slice delivery, 28-test evidence, DoD checklist |

---

## 📁 diagrams/

| File | Description |
|------|-------------|
| [`erd.mmd`](diagrams/erd.mmd) | Entity-Relationship Diagram (multi-seller: brands, seller_orders, seller fields) |
| [`dfd-level-0.mmd`](diagrams/dfd-level-0.mmd) | DFD Level 0 — Context diagram (Shopper, Seller, Admin, Payment Gateway, Email) |
| [`dfd-level-1.mmd`](diagrams/dfd-level-1.mmd) | DFD Level 1 — Six main processes (P1–P6) with data stores D1–D6 |
| [`dfd-level-2-checkout.mmd`](diagrams/dfd-level-2-checkout.mmd) | DFD Level 2 — Checkout and payment flow (3.0 and 4.0 decomposed) |
| [`dfd-level-2-fulfillment.mmd`](diagrams/dfd-level-2-fulfillment.mmd) | DFD Level 2 — Seller order fulfillment (5.0 decomposed) |
| [`dfd-level-2-inventory.mmd`](diagrams/dfd-level-2-inventory.mmd) | DFD Level 2 — Inventory management (6.0 stock-adjustment part) |
| [`sitemap.mmd`](diagrams/sitemap.mmd) | Site map + user navigation flow diagram |

---

## 📁 wireframes/

| File | Description |
|------|-------------|
| [`homepage-wireframe.md`](wireframes/homepage-wireframe.md) | Homepage layout wireframe |
| [`catalog-and-pdp-wireframes.md`](wireframes/catalog-and-pdp-wireframes.md) | Shop catalog and product detail page wireframes |
| [`checkout-and-admin-wireframes.md`](wireframes/checkout-and-admin-wireframes.md) | Checkout flow and admin dashboard wireframes |

---

## 📁 test-reports/

| File | Description |
|------|-------------|
| [`executed-test-report.md`](test-reports/executed-test-report.md) | Full executed test report — 28 tests, 0 failures, with step-by-step evidence |
