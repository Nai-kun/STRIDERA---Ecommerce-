# Assumptions and Gaps — STRIDERA

> Classification: Source-defined | Inferred | Missing | Conflicting | Recommended

## Naming Decision
- Brief calls project "Stridera"; skill calls it "STRIDE". **Resolved**: Use "STRIDERA" as brand name (from logo). Internal project folder = STRIDERA. Display name = "STRIDERA". [Source-defined]

## Architecture
- Framework: Next.js 14 (App Router) frontend + Node.js/Express backend API + PostgreSQL database. [Recommended — not in brief]
- Payment: PayMongo sandbox (GCash, Maya, GrabPay). [Source-defined]
- Shipping: Manual fulfillment (no third-party API). [Source-defined]

## Categories
- Source provides: Running Men, Running Women, Sneakers Men, Sneakers Women. [Source-defined]
- Brief mentions: Running, Basketball, Training, Lifestyle. Basketball and Training have no source images. [Missing → Inferred] Basketball and Training categories exist in DB with generated placeholder product data, clearly labeled "[Demo]".

## Sizes
- Brief: US 7-10. [Source-defined]
- Extended to US 7-12 per skill spec Section 9. [Recommended — logged as Conflicting → resolved: use US 7-12]

## Promotions/Discounts
- Brief: Excludes complex coupon engine. [Source-defined Won't Have]
- Skill spec: Requires basic promo code. [Conflicting → resolved]: Implement simple flat-amount and percentage promo codes (no tiered rewards, no flash-sale timers). [Recommended]

## Payment Simulation
- Demo Safety Fallback "Simulate Payment Success" enabled only when DEMO_MODE=true env var, admin/presenter only, audit-logged, labeled as simulated. [Source-defined + Recommended]

## Currency
- PHP (Philippine Peso) as primary currency. DECIMAL(10,2) in centavos-style integer storage (stored as centavos, displayed as pesos). [Recommended]

## Real Money
- NEVER. Sandbox only. [Source-defined]

## User Accounts
- Guest checkout allowed; optional account creation at checkout. [Source-defined Should]
- Full account features: register, login, profile, order history, addresses. [Source-defined Should]

## Wishlist
- Listed as Could Have in brief. [Source-defined] → Implemented as Should (included in D9 data store in DFDs). [Recommended]

## Email Notifications
- Could Have in brief. [Source-defined] → Implemented with nodemailer sandbox/log (no real SMTP required in demo). [Recommended]

## Admin Dashboard
- Must Have per brief. Includes product CRUD, category/inventory management, order management, payment status. [Source-defined]
- Sales reports: basic aggregate queries. [Recommended]

## Security
- Argon2 password hashing, JWT sessions, CSRF protection, rate limiting, parameterized queries via Prisma ORM. [Recommended]
