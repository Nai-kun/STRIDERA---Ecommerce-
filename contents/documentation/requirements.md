# Requirements Specification — STRIDERA E-Commerce

> Version: 1.0 | Date: 2026-10-27

## Functional Requirements

### FR-01: User Authentication & Account Management
- FR-01.1: Users can register with email and password
- FR-01.2: Users can log in and receive a session token (JWT)
- FR-01.3: Users can log out (invalidate session)
- FR-01.4: Users can request password reset via email
- FR-01.5: Users can view/edit profile information
- FR-01.6: Users can manage multiple saved addresses
- FR-01.7: Users can view order history with details
- FR-01.8: Sessions expire after configurable idle time
- FR-01.9: Guest checkout allowed without registration

### FR-02: Product Catalog & Search
- FR-02.1: Homepage displays hero banner, new arrivals, trending, category sections
- FR-02.2: Shop page shows searchable, filterable product catalog
- FR-02.3: Filter by: category, audience (men/women), shoe type, size, color, price range, availability
- FR-02.4: Sort by: newest, price (asc/desc), popularity
- FR-02.5: Pagination or load-more with proper state
- FR-02.6: Filter state reflected in shareable URL query parameters
- FR-02.7: Empty, loading, and no-results states
- FR-02.8: Clear-all-filters action
- FR-02.9: Mobile filter drawer
- FR-02.10: Product cards show image, name, category, price, sale price

### FR-03: Product Detail Page
- FR-03.1: Image gallery with thumbnails
- FR-03.2: Product name, SKU, description, features
- FR-03.3: Color variant selector with visual swatches
- FR-03.4: Size selector (US 7-12)
- FR-03.5: Per-variant stock indicator (in-stock/low/out-of-stock)
- FR-03.6: Current and previous price (only for valid discounts)
- FR-03.7: Quantity selector
- FR-03.8: Add-to-cart (requires size + color selection first)
- FR-03.9: Delivery/returns information
- FR-03.10: Related products section
- FR-03.11: Clear feedback for invalid selection or unavailable variant
- FR-03.12: Wishlist toggle (if authenticated)

### FR-04: Shopping Cart
- FR-04.1: View cart items with image, name, size, color, unit price, quantity, subtotal
- FR-04.2: Adjust quantity (with stock validation)
- FR-04.3: Remove items
- FR-04.4: Apply promo code
- FR-04.5: Display subtotal, discount, shipping estimate, grand total
- FR-04.6: Continue shopping link
- FR-04.7: Checkout CTA
- FR-04.8: Empty cart state
- FR-04.9: Server-side revalidation of prices, discounts, and stock

### FR-05: Checkout Flow
- FR-05.1: Step 1: Customer information (name, email, phone)
- FR-05.2: Step 2: Shipping address (with saved address option)
- FR-05.3: Step 3: Delivery method (flat-rate shipping)
- FR-05.4: Step 4: Order review (items, totals, address)
- FR-05.5: Step 5: Payment method selection (GCash, Maya, GrabPay)
- FR-05.6: Step 6: Payment processing (redirect to provider)
- FR-05.7: Step 7: Order confirmation page
- FR-05.8: Guest checkout with optional account creation
- FR-05.9: All validation performed server-side
- FR-05.10: Prevent duplicate order submissions (idempotency)

### FR-06: Payment Processing
- FR-06.1: Create payment session via PayMongo sandbox API (server-side)
- FR-06.2: Redirect customer to payment provider UI
- FR-06.3: Receive and verify webhook from PayMongo (server-side)
- FR-06.4: Verify webhook signature
- FR-06.5: Idempotent payment result processing
- FR-06.6: Record provider transaction reference and status
- FR-06.7: Handle success, failure, cancel, timeout, duplicate callbacks
- FR-06.8: Order status: PENDING → PAID or FAILED
- FR-06.9: Never mark order PAID from browser redirect/client message
- FR-06.10: Demo fallback: "Simulate Payment Success" (DEMO_MODE=true, admin-only, audit-logged)

### FR-07: Order Management
- FR-07.1: Customer can view order list and detail
- FR-07.2: Order detail shows items, totals, payment status, shipping status
- FR-07.3: Order tracking information display
- FR-07.4: Order status transitions are audit-logged

### FR-08: Inventory Management
- FR-08.1: Stock tracked per variant (size + color)
- FR-08.2: Stock deducted atomically on order payment (transactional with row locking)
- FR-08.3: Stock restored on payment failure/cancellation
- FR-08.4: Stock movements recorded in audit log
- FR-08.5: Out-of-stock variants disabled in UI

### FR-09: Admin Dashboard
- FR-09.1: Role-protected access (admin role required)
- FR-09.2: Product CRUD (create, read, update, delete/deactivate)
- FR-09.3: Category and collection management
- FR-09.4: Product image management
- FR-09.5: Size/color variant management
- FR-09.6: Inventory management (stock updates with reason)
- FR-09.7: Order list with status filters (UNPAID/PENDING vs PAID)
- FR-09.8: Order detail with payment status and transaction refs
- FR-09.9: Shipment status updates and tracking entry
- FR-09.10: Promotion/promo code management
- FR-09.11: Customer account list
- FR-09.12: Basic sales and inventory reports
- FR-09.13: All admin actions audit-logged

### FR-10: Promotions
- FR-10.1: Simple promo codes (flat-amount or percentage off)
- FR-10.2: Promo code validation (active, not expired, usage limits)
- FR-10.3: Applied server-side during cart/checkout
- FR-10.4: Admin can create/edit/deactivate promo codes

### FR-11: Wishlist
- FR-11.1: Authenticated users can add/remove products to wishlist
- FR-11.2: Wishlist viewable in account area
- FR-11.3: Quick add-to-cart from wishlist

### FR-12: Fulfillment & Notifications
- FR-12.1: Manual fulfillment workflow (admin enters tracking)
- FR-12.2: Configurable shipping fee
- FR-12.3: Shipment status updates
- FR-12.4: Email notification on order confirmation (sandbox/console)
- FR-12.5: Email notification on shipment status change

---

## Non-Functional Requirements

### NFR-01: Performance
- Page load < 3 seconds on broadband
- Responsive images (WebP preferred), lazy-loaded below fold
- Layout space reserved for images (no CLS)
- Database indexes on frequently queried columns
- API response pagination and result limits
- Minimal JS bundle size

### NFR-02: Security
- Argon2 password hashing (cost factor ≥ 10)
- JWT in httpOnly, secure, sameSite cookies
- CSRF token protection
- XSS output encoding
- Parameterized queries via Prisma ORM
- Rate limiting: 5 attempts/minute on login, 10/minute on sensitive routes
- File upload validation (type, size)
- Mass-assignment protection
- No secrets in client bundle or logs
- No raw card data storage
- Least-privilege DB accounts
- Audit logging for all admin mutations

### NFR-03: Accessibility
- WCAG 2.1 AA compliance target
- Semantic HTML5 elements
- Keyboard navigable
- Visible focus indicators
- Color contrast ratio ≥ 4.5:1
- Meaningful alt text for all product images
- Form labels and error messages
- prefers-reduced-motion honored

### NFR-04: Responsiveness
- Desktop: ≥ 1024px
- Tablet: 768px – 1023px
- Mobile: < 768px
- Touch-friendly tap targets (≥ 44px)
- Mobile filter drawer
- Responsive navigation

### NFR-05: Maintainability
- Consistent code style and conventions
- Component-based architecture
- Separation of concerns (presentation/business/data layers)
- Environment-based configuration
- Comprehensive documentation

### NFR-06: Data Integrity
- Money stored as integer centavos (never floats)
- Transactional writes for order + inventory
- Idempotent payment callbacks
- Referential integrity via foreign keys
- Input validation at API boundary

---

## Sitemap

```
STRIDERA
├── / (Homepage)
├── /shop (Catalog with filters)
│   ├── /shop?category=running
│   ├── /shop?category=lifestyle
│   ├── /shop?category=basketball
│   └── /shop?category=training
├── /product/:slug (Product Detail)
├── /cart (Shopping Cart)
├── /checkout (Multi-step Checkout)
│   ├── /checkout/information
│   ├── /checkout/shipping
│   ├── /checkout/review
│   └── /checkout/payment
├── /order-confirmation/:id
├── /account
│   ├── /account/login
│   ├── /account/register
│   ├── /account/forgot-password
│   ├── /account/profile
│   ├── /account/addresses
│   ├── /account/orders
│   ├── /account/orders/:id
│   └── /account/wishlist
├── /admin (Dashboard — role-protected)
│   ├── /admin/products
│   ├── /admin/products/:id/edit
│   ├── /admin/categories
│   ├── /admin/orders
│   ├── /admin/orders/:id
│   ├── /admin/inventory
│   ├── /admin/promotions
│   ├── /admin/customers
│   └── /admin/reports
└── /404 (Not Found)
```

## User Navigation Flow

```
Guest/Customer:
  Homepage → Browse by Category → Shop Page (filter/sort/search)
  → Product Detail (select size/color) → Add to Cart
  → Cart (review/adjust) → Checkout (info → shipping → review → payment)
  → Payment Provider → Order Confirmation
  → Account → Order History → Order Detail

Admin:
  Login → Admin Dashboard → Manage Products/Orders/Inventory/Promotions
  → View Reports → Process Orders → Update Shipments
```
