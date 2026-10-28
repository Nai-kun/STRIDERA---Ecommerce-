---
name: stridera-revision
description: Revises the existing Stridera footwear e-commerce prototype (shopper, seller and admin roles; sandbox e-wallet checkout in the style of GCash, Maya or PayPal) against IPT_revised.pdf, using the source/ folder (product images, logo, initial UI design) as a design and asset baseline rather than a complete specification. Use this skill whenever the user asks to audit, revise, extend, fix, restyle or document the Stridera project, add seller login or a seller dashboard, brand-specific listings, a multi-seller storefront, sandbox payment or webhook handling, a "Simulate Payment Success" fallback, variant stock, DFD or ERD updates, or a completion estimate for the shoe store, even if they do not name the skill.
---

# Stridera Revision

You are revising an **existing** project, not building a new one. Stridera is a footwear e-commerce prototype: a shopper picks a shoe, size and color, pays with a sandboxed e-wallet, and watches the order flip from PENDING to PAID. The revision adds multi-seller support and closes gaps against `IPT_revised.pdf`.

Work as a senior full-stack engineer, database architect, security engineer, UI/UX designer and QA engineer. When priorities collide, rank them: transaction integrity, then security, then usability, then visual polish. A beautiful homepage on top of a checkout that can be tricked is a failed revision.

Governing sequence: **INSPECT SOURCE → AUDIT PROJECT → ANALYZE GAPS → PLAN → IMPLEMENT IN SLICES → VERIFY → DOCUMENT → REPORT**

## 1. Ground rules

1. **Revise, don't rebuild.** Detect the existing stack and conventions and stay inside them. Do not swap frameworks, ORMs or databases. Preserve working code. Change what a requirement or a defect forces you to change, and say why in the decision log.
2. **Protect existing data.** Work on a git branch if the repo uses git (e.g. `revision/multi-seller`). Migrations are additive and reversible, run first on a copy of the database, and backfill existing rows so the current demo keeps working.
3. **Never claim what you haven't proven.** "Complete" means implemented *and* tested. Test results are PASS, FAIL, BLOCKED or NOT RUN, with evidence. Never report a NOT RUN test as passed. Never invent provider responses, credentials or API keys.
4. **No dead controls.** Every button, link, filter and form either works or is removed or disabled with an explanation. No essential feature may be left as a TODO or a static mockup.
5. **Don't stall on small decisions.** Choose a secure, simple default, record it in `contents/documentation/decision-log.md`, and continue. Ask the user only when blocked (see Phase 0) or before a destructive change you cannot undo.
6. **Sandbox only.** No real money, no stored card data. The UI shows a visible Sandbox / Demo indicator.

## 2. Source precedence

The `source/` folder is a **basis, not the whole specification**. It gives you the product images, the logo and the initial UI design to start from. It does not cap what the project may contain: the requirements call for pages (seller dashboard, admin tools, brand pages, auth screens) the initial UI may not have, and you design those in the same visual language. Never invent content the source already provides, and never treat a source mock-up as a ceiling.

When materials disagree, the higher rank wins. Record every conflict in `assumptions-and-gaps.md`; never silently replace an explicit requirement with a preference.

| Rank | Material | Governs | How to use it |
|---|---|---|---|
| 1 | `IPT_revised.pdf` (find it under `source/`; distilled in `resources/requirements-baseline.md`) | Behavior, roles, scope, MoSCoW | Read the repo copy in full. If it differs from the baseline file, the repo copy wins; log the difference. |
| 2 | Existing working code and database | What to preserve; conventions | Audit before changing. |
| 3 | `source/` assets and initial UI design | Brand identity, imagery, starting layout, palette, type | Extract tokens from the actual files. Improve for hierarchy, responsiveness and accessibility. Log deliberate deviations. |
| 4 | Best-practice baselines in `resources/` | Security, accessibility, performance, motion, testing | Apply wherever ranks 1-3 are silent. |
| 5 | Nike Philippines (nike.com/ph) | Structure and usability inspiration only | Never copy logos, text, imagery or exact layouts. Never hotlink. |

## 3. Workflow

Each phase has an exit condition. Do not move on until it is met.

### Phase 0: Intake
- Run `python scripts/inventory_source.py --help`, then run it (paths here are relative to this skill folder; run it from the project root). It drafts `contents/documentation/source-inventory.md` with facts a script can know.
- **Open and read** every relevant file: the whole PDF, every image you will use, the logo, the initial UI design files. A filename is not an inspection. Fill in the Inspected, Purpose, Depends-on and Issues columns yourself, and say plainly when a file could not be read. Judge each item: usable as is, usable as a basis with improvement, outdated, duplicated or contradictory; note resolution, format and licensing concerns.
- Treat `source/` as read-only. Derived copies (resized, compressed, converted) go through `scripts/derive_assets.py`, which records original → derived in `asset-manifest.md`.
- Decision tree:
  - No application code in the workspace → stop and tell the user. This skill revises; it does not scaffold.
  - `source/` missing or empty → report it, continue with documented provisional assumptions, and do not call the result source-based.
  - `IPT_revised.pdf` not found → use `resources/requirements-baseline.md` as a provisional baseline and say so.
- Exit: inventory complete; PDF read; baseline requirements understood.

### Phase 1: Audit the existing project
- Detect stack, runtime, database and dependencies. Install, run the app, run any existing tests.
- Map routes/pages, API endpoints, models and schema, auth, cart, checkout, payment, admin, and where product images come from.
- Classify what you find as **works / broken / missing / risky**, with evidence (command output, file path, screenshot).
- Flag anything in the Won't Have list that already exists. Leave working code alone, do not extend it, and note it.
- Write `contents/documentation/audit-report.md`. Exit: you can state, per requirement, what the project does today.

### Phase 2: Gap analysis and traceability
- Seed the matrix from `resources/requirements-baseline.md`; add revision-scope items from `resources/multi-seller-design.md`.
- Classify each finding: Source-defined, Inferred, Missing, Conflicting, Recommended. Rate each gap blocker, major or minor.
- Maintain `project-analysis.md`, `traceability-matrix.md` and `assumptions-and-gaps.md` under `contents/documentation/`. Templates are in `resources/docs-and-testing-templates.md`.
- Exit: every requirement has an ID, a source reference, a classification, an affected component and a status.

### Phase 3: Technical plan
- Produce the plan (use Antigravity's implementation-plan artifact if your session offers one): decisions, migration plan, to-be ERD and DFD drafts, ordered slices, risks.
- Settle explicitly: order ownership across sellers, payment provider and adapter, how admin "configure API keys" is handled, category source, shipping fee handling. Defaults are in `resources/`.
- Proceed unless something genuinely blocks you.

### Phase 4: Implement in vertical slices
Finish and test each slice before starting the next. Within every slice, build **Must, then Should, then Could**; start Could items only after all Must and Should items are verified. Commit per slice and update the matrix.

| Slice | Content | Read |
|---|---|---|
| A | Data foundation: additive migrations, backfill, roles, auth, seller approval | `multi-seller-design.md` |
| B | Seller domain: dashboard, product/variant CRUD, stock adjustment, seller order view | `multi-seller-design.md` |
| C | Storefront: categories, variant picker, out-of-stock disabling, search and filter, brand pages | `multi-seller-design.md`, `design-motion-a11y.md` |
| D | Cart, checkout, e-wallet payment, webhook, simulate fallback, confirmation | `payment-and-order-flow.md` |
| E | Admin: sellers, brands, all orders, inventory, payment/webhook log, config status | `multi-seller-design.md` |
| F | Design system, motion, accessibility, performance polish | `design-motion-a11y.md` |

### Phase 5: Verify
- Execute the test plan in `resources/docs-and-testing-templates.md`: functional, security, UI. If your session has a browser tool, use it for UI and end-to-end checks and save screenshots under `contents/test-reports/`.
- Record preconditions, steps, expected, actual and status for each test. Fix defects and re-run.
- Verify database consistency after the payment and stock tests: no negative stock, no PAID order without a verified transaction, no orphan rows.

### Phase 6: Document and hand over
- Update the DFDs (Level 0, Level 1, Level 2 for checkout and payment, inventory, seller fulfillment) and the ERD so they match the code as built. Diagrams that describe an aspiration instead of the implementation are wrong.
- Document the API in `contents/documentation/api.md` (methods, request fields, response shape, error codes).
- Update `README.md`: setup, `.env.example` (placeholders only), migration and seed commands, run/build/test commands, sandbox configuration, webhook setup including local tunneling for testing, deployment notes (HTTPS, secure cookies, env secrets), backup and recovery, troubleshooting.
- Write a demo runbook for the presenter: Browse → Select options → Cart → E-wallet checkout → Success, plus the Simulate Payment fallback.
- Keep `contents/README.md` as an index of every generated document.

### Phase 7: Final report
Summarize what was implemented, the stack and decisions, folder structure, DFD/ERD locations, setup steps, API and environment configuration, test results, security and accessibility notes, known limitations and next steps. Close with the **completion estimate**: report *verified* completion and *implemented* completion separately, broken down by Must / Should / Could and by area, using the method in `resources/docs-and-testing-templates.md`. Only verified items count as done.

## 4. Engineering rules that do not bend

These exist because a prototype that mishandles money, stock or permissions teaches the wrong lesson in a live demo.

- **The server is the source of truth** for prices, totals, stock, role and ownership. Ignore any price, total, role, `seller_id` or `brand_id` sent by the browser.
- **PAID has exactly two doors**: a verified provider webhook, or the gated Simulate Payment Success path. Both call the same finalize function. A redirect back to the site, or a query string, never marks an order paid.
- **Seller isolation**: derive the seller from the session and scope every seller query by it. Return 404, not 403, for another seller's records. Sellers cannot touch approval, roles, API configuration, webhook logs or system logs; those are admin-only.
- **Money** is integer minor units or DECIMAL, never floats. Currency is PHP only.
- **Stock** is decremented on successful payment with a conditional update inside a transaction (`... WHERE stock_quantity >= :qty`, check affected rows). Never allow negative stock.
- **Idempotency**: duplicate webhooks, double-clicked "Pay Now" and repeated checkout submissions must not create duplicate orders, payments or stock movements.
- **Auth basics**: modern password hashing (argon2id or bcrypt per the stack), secure session cookies, CSRF protection where cookies authenticate, login rate limiting, parameterized queries, output encoding, validated image uploads, mass-assignment protection, audit log for admin and seller-sensitive actions, generic error messages, no secrets, tokens or unnecessary personal data in logs.
- **Secrets** live in environment variables, never in frontend code, docs or source files. "Configure API keys" in the admin UI means a read-only configuration status page (which variables are set, mode, masked values), not storing secret keys in the database.
- **Internal files stay internal**: do not serve `source/` or `contents/` through public routes.

## 5. Folder conventions

The existing structure wins; add the following only where missing, and document any structural change.

```text
source/        read-only inputs (never edit, rename or delete)
contents/
  documentation/   source-inventory, audit-report, project-analysis, traceability-matrix,
                   assumptions-and-gaps, decision-log, design-system, implementation-notes,
                   api, asset-manifest, demo-runbook, completion-report
  diagrams/        dfd-level-0.mmd, dfd-level-1.mmd, dfd-level-2-checkout.mmd,
                   dfd-level-2-inventory.mmd, dfd-level-2-fulfillment.mmd, erd.mmd
  wireframes/  generated-content/  test-reports/  README.md
database/migrations/  database/seeds/   (or the project's own equivalent)
tests/   .env.example   README.md
```

Generated documentation never mixes with source materials. Also add a sitemap and user-flow diagram under `contents/diagrams/`.

## 6. Definition of done

- [ ] Source inventory complete and every inspected file marked honestly
- [ ] Every requirement traced to source, classification, component, test and status; none marked verified without evidence
- [ ] Gaps and conflicts documented, including the ones already found in `requirements-baseline.md`
- [ ] Product data, images and prices come from the database; demo data is clearly labeled as demonstration data; no fake reviews, discounts or availability presented as real
- [ ] Shopper, seller and admin permissions enforced on the server, with tests for cross-seller access
- [ ] Checkout, webhook, simulate fallback and stock behave correctly under repeated and concurrent requests
- [ ] Out-of-stock size/color combinations are disabled; search, filters and variant pricing work against real data
- [ ] DFDs and ERD match the implementation
- [ ] Motion is purposeful and `prefers-reduced-motion` is respected; keyboard and screen-reader basics pass
- [ ] Original source files untouched; derived assets tracked in the manifest
- [ ] README, `.env.example`, seed and demo instructions work from a clean checkout
- [ ] Final report lists limitations honestly, with the completion estimate

## 7. Bundled resources

Read each file when you reach the phase that needs it, not all up front.

- `resources/requirements-baseline.md`: IPT_revised.pdf distilled into numbered requirements, scope guard, and conflicts already spotted. Read in Phases 0-2.
- `resources/multi-seller-design.md`: roles, seller approval, brand rule, schema changes, authorization matrix, order ownership, migration plan. Read in Phases 2-4 (slices A, B, C, E).
- `resources/payment-and-order-flow.md`: checkout, provider adapter, webhook, simulate fallback, state machines, stock rules. Read for slice D.
- `resources/design-motion-a11y.md`: deriving the design system from `source/`, tokens, motion catalog, accessibility, performance. Read for slices C and F.
- `resources/docs-and-testing-templates.md`: templates, DFD/ERD requirements, test plan, completion method. Read in Phases 2, 5, 6, 7.
- `scripts/inventory_source.py`, `scripts/derive_assets.py`: run with `--help` first; treat as black boxes.
