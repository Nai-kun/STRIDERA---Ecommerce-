# Project Analysis — STRIDERA E-Commerce

> Generated: 2026-10-27 | Version: 1.0

## 1. Project Objectives

Build a fully functional, motion-driven shoe e-commerce website for the **STRIDERA** brand with:
- A public-facing storefront for browsing, filtering, and purchasing shoes
- An e-wallet sandbox payment system (PayMongo: GCash, Maya, GrabPay)
- A role-protected admin dashboard for product/order/inventory management
- Complete documentation including DFDs, ERD, and test reports
- Manual fulfillment workflow (no third-party logistics APIs)

## 2. Target Users

| Role | Description | Key Actions |
|------|-------------|-------------|
| **Shopper (Customer)** | End user browsing and purchasing shoes | Browse catalog, filter/search, select variants, add to cart, checkout, track orders |
| **Administrator / Presenter** | Store manager / demo presenter | Manage products, inventory, orders, promotions, view reports, simulate payments in demo mode |
| **Guest** | Non-registered visitor | Browse catalog, add to cart, guest checkout with optional account creation |

## 3. Product Catalog Needs

### Categories (from source + brief)
| Category | Source Images | Status |
|----------|-------------|--------|
| Running (Men) | 5 images (runningmen1-5.jpg) | Source-defined |
| Running (Women) | 5 images (runningwomen1-5.jpg) | Source-defined |
| Lifestyle/Sneakers (Men) | 2 images (Sneakermen1-2.jpg) | Source-defined |
| Lifestyle/Sneakers (Women) | 5 images (Sneakerswomen1 + Sneakerwomen2-5.jpg) | Source-defined |
| Basketball | No source images | Inferred — [Demo] placeholder products |
| Training | No source images | Inferred — [Demo] placeholder products |

### Product Attributes
- **Sizes:** US 7, 8, 9, 10, 11, 12 (extended per skill spec)
- **Colors:** Derived from product images (black/teal/lime, cream/pink/mint, brown/tan, white/blue)
- **Stock:** Per-variant (size + color combination)
- **Pricing:** PHP (Philippine Peso), stored as integer centavos

## 4. Required Pages

| Page | Priority | Key Features |
|------|----------|-------------|
| Homepage | Must | Hero, new arrivals, trending, category cards, promo banners |
| Shop / Catalog | Must | Filters, sort, search, pagination, category nav |
| Product Detail (PDP) | Must | Gallery, variant picker, stock indicator, add-to-cart |
| Cart | Must | Line items, quantity adjust, totals, discount, checkout CTA |
| Checkout (multi-step) | Must | Info → Shipping → Review → Payment → Confirmation |
| Order Confirmation | Must | Order summary, payment status, next steps |
| Login / Register | Should | Email/password auth, form validation |
| Customer Account | Should | Profile, addresses, order history, wishlist |
| Admin Dashboard | Must | Products, orders, inventory, promotions, reports |
| Password Reset | Should | Email-based reset flow |
| 404 / Error | Should | Branded error pages |

## 5. Business Rules

1. **Pricing:** All prices in PHP, stored as integer centavos (DECIMAL(10,2) equivalent). No floating-point math.
2. **Stock:** Per-variant. Cannot add to cart if stock = 0. Deducted inside DB transaction with row locking.
3. **Cart:** Server-side price/discount/stock revalidation before checkout. Browser totals are display-only.
4. **Checkout:** Guest allowed. Step-by-step. All validation server-side.
5. **Payment:** PayMongo sandbox only. Server creates payment session. Server verifies webhook. Order status transitions: PENDING → PAID or FAILED. Never mark PAID from browser redirect.
6. **Demo fallback:** "Simulate Payment Success" when DEMO_MODE=true, admin-only, audit-logged.
7. **Promotions:** Simple flat-amount or percentage promo codes. No tiered rewards or flash sales.
8. **Shipping:** Manual fulfillment. Configurable flat-rate shipping fee. Admin enters tracking manually.
9. **Returns/Refunds:** Out of scope for initial build.
10. **Currency:** PHP only. No multi-currency.

## 6. Database & Integration Needs

- **Database:** PostgreSQL (recommended in assumptions)
- **ORM:** Prisma
- **Payment gateway:** PayMongo sandbox API
- **Email:** Nodemailer with sandbox/console transport
- **Image storage:** Local filesystem (source product images)
- **Auth:** Argon2 + JWT

## 7. Security Requirements

- Argon2 password hashing
- JWT session tokens (httpOnly cookies)
- CSRF protection
- Rate limiting on auth routes
- Parameterized queries (Prisma ORM)
- Input validation and sanitization
- Role-based access control
- No raw card data storage
- Audit logging for admin actions
- Secret keys in environment variables only

## 8. Accessibility Requirements

- Semantic HTML5 elements
- ARIA labels where needed
- Keyboard navigation
- Visible focus states
- Color contrast ≥ 4.5:1 for text
- Meaningful alt text for images
- `prefers-reduced-motion` support
- Clear error/validation messages

## 9. Test & Deploy Expectations

- Functional tests for all commerce flows
- Security tests for access control and input validation
- UI tests for responsive layouts and interactions
- Test reports in `contents/test-reports/`
- Deployment guide for Node.js + PostgreSQL
- HTTPS guidance
- `.env.example` with all required variables (no real secrets)

---

## 10. Traceability Matrix

| Req ID | Requirement | Source | Classification | Component | Status | Test Ref |
|--------|------------|--------|---------------|-----------|--------|----------|
| R-001 | Product gallery by category | IPT Brief (Must) | Functional | Frontend: Shop page | Not Started | T-001 |
| R-002 | Attribute selectors (size, color) | IPT Brief (Must) | Functional | Frontend: PDP | Not Started | T-002 |
| R-003 | Shopping cart with totals | IPT Brief (Must) | Functional | Frontend + Backend: Cart | Not Started | T-003 |
| R-004 | E-wallet API call (PayMongo) | IPT Brief (Must) | Functional | Backend: Payment service | Not Started | T-004 |
| R-005 | Order status confirmation | IPT Brief (Must) | Functional | Backend + Frontend: Orders | Not Started | T-005 |
| R-006 | Out-of-stock disabling | IPT Brief (Should) | Functional | Frontend: PDP variants | Not Started | T-006 |
| R-007 | Demo fallback (Simulate Payment) | IPT Brief (Should) | Functional | Backend: Payment service | Not Started | T-007 |
| R-008 | User accounts (register/login) | IPT Brief (Should) | Functional | Backend: Auth | Not Started | T-008 |
| R-009 | Admin order dashboard | IPT Brief (Should) | Functional | Frontend: Admin | Not Started | T-009 |
| R-010 | Search functionality | IPT Brief (Could) | Functional | Backend + Frontend: Search | Not Started | T-010 |
| R-011 | Homepage with hero + sections | Skill Spec §5 | Functional | Frontend: Homepage | Not Started | T-011 |
| R-012 | Filters (audience, type, size, color, price) | Skill Spec §5 | Functional | Frontend + Backend: Shop | Not Started | T-012 |
| R-013 | Per-variant stock tracking | Skill Spec §6 | Functional | Backend: Inventory | Not Started | T-013 |
| R-014 | Server-side cart revalidation | Skill Spec §5 | Security | Backend: Cart service | Not Started | T-014 |
| R-015 | Server-verified payment status | Skill Spec §8 | Security | Backend: Payment webhook | Not Started | T-015 |
| R-016 | Multi-step checkout | Skill Spec §5 | Functional | Frontend: Checkout | Not Started | T-016 |
| R-017 | Guest checkout | Skill Spec §5 | Functional | Frontend + Backend: Checkout | Not Started | T-017 |
| R-018 | Customer account pages | Skill Spec §5 | Functional | Frontend: Account | Not Started | T-018 |
| R-019 | Admin product CRUD | Skill Spec §5 | Functional | Frontend + Backend: Admin | Not Started | T-019 |
| R-020 | Admin inventory management | Skill Spec §5 | Functional | Backend: Admin inventory | Not Started | T-020 |
| R-021 | Basic promotions/promo codes | Skill Spec §5 (Conflicting resolved) | Functional | Backend: Promo service | Not Started | T-021 |
| R-022 | Manual fulfillment workflow | Skill Spec §8 | Functional | Backend: Shipment | Not Started | T-022 |
| R-023 | Responsive design (desktop/tablet/mobile) | Skill Spec §7 | Non-Functional | Frontend: All pages | Not Started | T-023 |
| R-024 | Motion/animations (purposeful) | Skill Spec §7 | Non-Functional | Frontend: CSS/JS | Not Started | T-024 |
| R-025 | prefers-reduced-motion support | Skill Spec §7 | Non-Functional | Frontend: CSS | Not Started | T-025 |
| R-026 | Argon2 password hashing | Skill Spec §8 | Security | Backend: Auth | Not Started | T-026 |
| R-027 | CSRF protection | Skill Spec §8 | Security | Backend: Middleware | Not Started | T-027 |
| R-028 | Rate limiting | Skill Spec §8 | Security | Backend: Middleware | Not Started | T-028 |
| R-029 | Audit logging for admin actions | Skill Spec §8 | Security | Backend: Audit service | Not Started | T-029 |
| R-030 | DFD L0, L1, L2 diagrams | Skill Spec §4 | Documentation | contents/diagrams/ | ✅ Complete | N/A |
| R-031 | ERD matching schema | Skill Spec §4 | Documentation | contents/diagrams/erd.mmd | Not Started | N/A |
| R-032 | Source inventory | Skill Spec §4 | Documentation | contents/documentation/ | ✅ Complete | N/A |
| R-033 | Assumptions and gaps | Skill Spec §4 | Documentation | contents/documentation/ | ✅ Complete | N/A |
| R-034 | Money as DECIMAL/integer (no floats) | Skill Spec §6 | Data Integrity | Backend + DB | Not Started | T-030 |
| R-035 | Idempotent payment processing | Skill Spec §8 | Data Integrity | Backend: Payment | Not Started | T-031 |
| R-036 | Wishlist | IPT Brief (Could) / Skill (Recommended) | Functional | Frontend + Backend | Not Started | T-032 |
| R-037 | Basic sales/inventory reports | Skill Spec §5 | Functional | Backend: Admin reports | Not Started | T-033 |
| R-038 | Shareable URL query params for filters | Skill Spec §5 | Functional | Frontend: Shop | Not Started | T-034 |
