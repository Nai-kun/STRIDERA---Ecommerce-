# STRIDERA REST API Documentation

> **Back-End Engine:** Python 3.12 · FastAPI · SQLAlchemy 2.0 ORM · PostgreSQL  
> **Base URL (Direct FastAPI):** `http://localhost:5000/api`  
> **Base URL (via Next.js Proxy):** `http://localhost:3000/api`  
> **Interactive OpenAPI / Swagger UI:** `http://localhost:5000/docs`  
> **ReDoc Reference:** `http://localhost:5000/redoc`

---

## 1. Architecture Overview

STRIDERA uses a modular **Python FastAPI** service layer communicating directly with **PostgreSQL** (`stridera` database, 24 relational tables + 18 enums) via **SQLAlchemy 2.0**, plus server-side **httpx** integrations with two free, zero-key public HTTPS REST APIs:

| Integration | Purpose | Base URL | Auth Required | Key Internal Routes |
|---|---|---|---|---|
| **PSGC Philippine Address API** | Live Region → Province → City/Municipality → Barangay cascading selectors & checkout hierarchy validation | `https://psgc.gitlab.io/api` | None (Free) | `GET /api/locations/regions`, `.../provinces`, `.../cities`, `.../barangays`, `POST /api/locations/validate-address`, `GET /api/locations/health` |
| **Nager.Date Public Holidays API** | Philippine national public holidays (`PH`) + Manila holiday-aware courier business-day delivery ETA calculator | `https://date.nager.at/api/v3` | None (Free) | `GET /api/schedule/holidays`, `GET /api/schedule/delivery-estimate`, `GET /api/schedule/health` |

---

## 2. Authentication & Security Model

- **Password Hashing:** Argon2 (`argon2-cffi`).
- **Session Persistence:** Stateful SHA-256 session tokens stored on `users.session_token_hash` paired with HTTP-only cookies (`token`, `stridera_session`) and Bearer `JWT` (`PyJWT`, HS256) with 7-day rolling expiration.
- **Role-Based Access Control (7 Roles):** `CUSTOMER`, `SELLER` (must have `sellerStatus == "APPROVED"`), `ADMIN`, `INVENTORY_MANAGER`, `DELIVERY_PERSONNEL`, `CUSTOMER_SUPPORT`, `FINANCE_OFFICER`.
- **Standard Error Shape:**
  ```json
  {
    "success": false,
    "message": "Human-readable validation or authorization message",
    "fieldErrors": { "phone": "Enter a valid PH mobile number, e.g. +63 917-123-4567." },
    "error": { "message": "..." }
  }
  ```

---

## 3. Core Endpoints Reference

### System & Health
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/` | Public | Runtime metadata & OpenAPI doc URLs |
| `GET` | `/api/health` | Public | Live Python FastAPI + PostgreSQL connectivity & external API summary |
| `GET` | `/docs` / `/redoc` | Public | Interactive Swagger & ReDoc API explorer |

### Authentication & Profile (`/api/auth`)
| Method | Endpoint | Access | Request Body / Query | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `firstName, lastName, email, phone (+63 9XX-XXX-YYYY), password, confirmPassword` | Shopper signup + Argon2 hash + session cookies |
| `POST` | `/api/auth/register-seller` | Public | `storeName, identificationDetails, firstName, lastName, email, phone, password, ...` | Seller application (starts as `PENDING` approval) |
| `POST` | `/api/auth/login` | Public | `email, password, keepSignedIn` | Sign in across all 7 roles |
| `POST` | `/api/auth/logout` | Optional Auth | — | Clears session cookies & DB session token |
| `GET` | `/api/auth/me` | Authenticated | — | Current user profile, partner brand & saved PH addresses |
| `PUT` | `/api/auth/profile` | Authenticated | `firstName, lastName, email, phone` | Update account profile |
| `PUT` | `/api/auth/password` | Authenticated | `currentPassword, newPassword, confirmPassword` | Change password & revoke existing sessions |
| `POST` | `/api/auth/forgot-password` | Public | `email, newPassword, confirmPassword` | Password recovery reset |
| `POST` | `/api/auth/addresses` | Authenticated | `fullName, phone, addressLine1, city, province, postalCode, [regionCode, provinceCode, cityCode, barangayCode]` | Save PH shipping address (server-verified via PSGC API when codes provided) |
| `DELETE` | `/api/auth/addresses/{id}` | Authenticated | — | Delete own saved address |

### Storefront Catalog, Categories, Brands & Wishlist
| Method | Endpoint | Access | Request Body / Query | Description |
|---|---|---|---|---|
| `GET` | `/api/products` | Public | `page, limit, category, brand, seller, audience, shoeType, search, minPrice, maxPrice, color, size, sort, featured, inStock` | Paginated multi-seller footwear search & filters |
| `GET` | `/api/products/featured` | Public | — | Top featured footwear cards |
| `GET` | `/api/products/filters` | Public | — | Distinct active categories, brands, approved sellers, sizes, colors & price bounds |
| `GET` | `/api/products/{slug}` | Optional Auth | — | Product detail page with color-grouped sizes, stock, related items & reviews |
| `POST` | `/api/products/{slug}/reviews` | Authenticated | `rating (1-5), sellerRating (1-5), comment, [orderNumber]` | Submit product & seller rating |
| `GET` | `/api/categories` | Public | — | Active footwear categories with product counts |
| `GET` | `/api/categories/{slug}` | Public | — | Category detail |
| `GET` | `/api/brands` | Public | — | Active Filipino partner brands |
| `GET` | `/api/brands/{slug}` | Public | — | Brand showcase + products |
| `GET` | `/api/wishlist` | Authenticated | — | Current shopper wishlist items |
| `POST` | `/api/wishlist/toggle` | Authenticated | `productId` | Toggle wishlist status |
| `POST` | `/api/wishlist` | Authenticated | `productId` | Add to wishlist |
| `DELETE` | `/api/wishlist/{productId}` | Authenticated | — | Remove from wishlist |

### Shopping Cart, Orders & E-Wallet Sandbox
| Method | Endpoint | Access | Request Body / Query | Description |
|---|---|---|---|---|
| `GET` | `/api/cart` | Optional Auth | Cookie `cart_session` for guests | Fetch/initialize cart with server-verified unit prices |
| `POST` | `/api/cart/items` | Optional Auth | `productVariantId, quantity (1..stock)` | Add item with stock validation |
| `PATCH` | `/api/cart/items/{itemId}` | Optional Auth | `quantity` | Update quantity respecting live stock |
| `DELETE` | `/api/cart/items/{itemId}` | Optional Auth | — | Remove item |
| `DELETE` | `/api/cart` | Optional Auth | — | Empty cart |
| `POST` | `/api/cart/merge` | Authenticated | `sessionId` | Merge guest cart into shopper cart on sign-in |
| `POST` | `/api/orders` | Optional Auth | `shippingAddress, [guestEmail], [promotionCode], [paymentMethod], [notes]` | Validate stock, verify PSGC hierarchy, compute Holiday ETA, split `SellerOrder` slices & clear cart |
| `GET` | `/api/orders` | Authenticated | — | Shopper order history |
| `GET` | `/api/orders/{orderNumber}` | Owner/Staff/Guest `?email=` | — | Detailed order summary + items + payments + shipments |
| `PATCH` | `/api/orders/{orderNumber}/confirm-receipt` | Owner/Admin | — | Confirm customer delivery receipt |
| `PATCH` | `/api/orders/{orderNumber}/cancel` | Owner/Support/Admin | — | Cancel PENDING/CONFIRMED order & restore stock if decremented |
| `POST` | `/api/payments/create-session` | Optional Auth | `orderNumber, paymentMethod (gcash\|maya\|paypal)` | Initialize built-in E-Wallet Sandbox QR session |
| `POST` | `/api/payments/confirm-sandbox` | Optional Auth | `orderNumber, paymentMethod, [referenceNumber]` | Atomically confirm payment, decrement stock, log `StockMovement` & mark `CONFIRMED` |
| `POST` | `/api/payments/fail-sandbox` | Authenticated | `orderNumber, [reason]` | Record failed payment attempt allowing retry |
| `POST` | `/api/payments/simulate` | Owner/Admin (Sandbox+Demo) | `orderNumber` | Instant demo payment fallback |
| `GET` | `/api/payments/{paymentId}` | Owner/Admin/Finance | — | Retrieve payment record |

### External Free APIs (`/api/locations` & `/api/schedule`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/locations/health` | Live PSGC upstream probe + TTL cache hit/miss counters |
| `GET` | `/api/locations/regions` | All 17 Philippine PSGC regions |
| `GET` | `/api/locations/regions/{regionCode}/provinces` | Provinces under a region (`hasProvinces: false` for NCR) |
| `GET` | `/api/locations/regions/{regionCode}/cities` | Cities/municipalities under a region |
| `GET` | `/api/locations/provinces/{provinceCode}/cities` | Cities/municipalities under a province |
| `GET` | `/api/locations/cities/{cityCode}/barangays` | Barangays under a city/municipality |
| `POST` | `/api/locations/validate-address` | Strict server-side PSGC hierarchy integrity validation |
| `GET` | `/api/schedule/health` | Live Nager.Date API probe + cache telemetry |
| `GET` | `/api/schedule/holidays?year=2026` | Official PH national public holidays + next 5 upcoming holidays |
| `GET` | `/api/schedule/delivery-estimate?regionCode=&province=&city=` | Holiday- & Sunday-aware NCR (2–3 business days) vs Provincial (4–6 business days) delivery window |

### Enterprise Role Portals
- **Seller Portal (`/api/seller/*` — Approved Seller):** `GET/PUT /profile`, `GET /dashboard`, `GET /metrics?period=`, `GET/POST/PUT/DELETE /products`, `PATCH /products/{id}/restore`, `POST /products/{id}/images`, `DELETE /products/{id}/images/{imageId}`, `POST /products/{id}/variants`, `PATCH /variants/{variantId}/stock`, `GET /orders`, `GET /orders/{id}`, `PATCH /orders/{id}/accept|fulfill|cancel`.
- **Inventory Portal (`/api/inventory/*` — Inventory Manager):** `GET /dashboard`, `GET /variants`, `POST /incoming`, `POST /outgoing`, `PATCH /variants/{id}/adjust`, `PATCH /variants/{id}/availability`, `GET /movements`, `GET /report`.
- **Delivery Portal (`/api/delivery/*` — Delivery Personnel):** `GET /shipments`, `PATCH /shipments/{id}/accept|collect|status|fail`.
- **Customer Support (`/api/support/*`):** `POST /tickets`, `GET /my-tickets`, `POST /tickets/{id}/messages`, plus Support-role `GET /tickets`, `GET /orders/lookup`, `PATCH /tickets/{id}/status`, `PATCH /tickets/{id}/action`.
- **Finance Officer (`/api/finance/*`):** `GET /dashboard`, `PATCH /payments/{id}/verify`, `POST /payouts`, `POST /refunds/{ticketId}/process`, `GET /reports`.
- **Administrator (`/api/admin/*`):** Full CRUD for `/products`, `/categories`, `/brands`, `/promotions`, `/sellers`, `/users` (role & status with self-lockout protection), `/orders`, `/customers`, `/reports/sales`, `/analytics`, `/audit-logs`, `/platform-config`, `/api-settings`, `/webhooks`, and `/health`.
