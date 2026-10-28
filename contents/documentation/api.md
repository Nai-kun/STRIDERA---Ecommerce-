# STRIDERA E-Commerce — API Reference

> Version: 2.0 (multi-seller) | Branch: `revision/multi-seller`
>
> Base URL: `http://localhost:4000` (dev) — all paths prefixed with `/api`.
>
> **Auth**: JWT stored in an `httpOnly` cookie (`token`). Requests that require authentication must have the cookie present. Role labels in the table header: 🌐 = public, 👤 = authenticated user, 🏪 = approved seller, 🔑 = admin.

---

## Global Response Envelope

All endpoints return JSON matching one of two shapes:

```json
// Success
{ "success": true, "data": <payload>, "pagination": <optional> }

// Error
{ "success": false, "message": "Human-readable error", "errors": [<optional validation array>] }
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `201` | Created |
| `400` | Validation / business rule failure |
| `401` | Not authenticated |
| `403` | Role not permitted (e.g., pending seller attempting approved-only action) |
| `404` | Not found — also used for tenant isolation (cross-seller lookups) |
| `409` | Conflict (e.g., email already registered) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## 1. Auth (`/api/auth`)

### `POST /api/auth/register` 🌐
Register a customer account.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `firstName` | string | ✓ | non-empty |
| `lastName` | string | ✓ | non-empty |
| `email` | string | ✓ | valid email, unique |
| `password` | string | ✓ | ≥ 8 chars |
| `phone` | string | – | optional |

**Response `201`**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "role": "CUSTOMER", "firstName": "...", "lastName": "..." },
    "token": "<JWT>"
  }
}
```

**Errors**: `400` validation | `409` email taken

---

### `POST /api/auth/register-seller` 🌐
Register a merchant seller account. Status starts as `PENDING` until an admin approves.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `firstName` | string | ✓ | non-empty |
| `lastName` | string | ✓ | non-empty |
| `email` | string | ✓ | valid email, unique |
| `password` | string | ✓ | ≥ 8 chars |
| `storeName` | string | ✓ | non-empty |
| `storeDescription` | string | – | optional |
| `phone` | string | – | optional |

**Response `201`**
```json
{
  "success": true,
  "message": "Seller registration submitted. Awaiting admin approval.",
  "data": { "user": { "id": "uuid", "email": "...", "role": "SELLER", "sellerStatus": "PENDING" } }
}
```

**Errors**: `400` validation | `409` email taken

---

### `POST /api/auth/login` 🌐
Authenticate a user and set the `token` cookie.

**Rate limit**: 10 attempts / 15 minutes per IP.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✓ |
| `password` | string | ✓ |

**Response `200`**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid", "email": "...", "role": "CUSTOMER|ADMIN|SELLER",
      "sellerStatus": "APPROVED|PENDING|NONE|...",
      "storeName": "...",
      "brand": { "id": "uuid", "name": "...", "slug": "..." }
    }
  }
}
```

**Errors**: `400` validation | `401` invalid credentials | `403` inactive account

---

### `POST /api/auth/logout` 👤
Clear the `token` cookie.

**Response `200`** `{ "success": true, "message": "Logged out" }`

---

### `GET /api/auth/me` 👤
Return the currently authenticated user's profile including seller/brand details.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "uuid", "email": "...", "role": "...",
    "sellerStatus": "...", "storeName": "...",
    "brand": { "id": "uuid", "name": "...", "slug": "..." },
    "addresses": [ /* saved addresses */ ]
  }
}
```

---

### `PUT /api/auth/profile` 👤
Update name, phone, or password.

**Request body** (all optional)

| Field | Type |
|-------|------|
| `firstName` | string |
| `lastName` | string |
| `phone` | string |
| `currentPassword` | string |
| `newPassword` | string (≥ 8 chars) |

**Response `200`** Updated user object.

---

### `POST /api/auth/addresses` 👤
Add a saved shipping address.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `label` | string | ✓ |
| `fullName` | string | ✓ |
| `phone` | string | ✓ |
| `addressLine1` | string | ✓ |
| `addressLine2` | string | – |
| `city` | string | ✓ |
| `province` | string | ✓ |
| `postalCode` | string | ✓ |
| `country` | string | – (default `PH`) |
| `isDefault` | boolean | – |

**Response `201`** Created address object.

---

### `DELETE /api/auth/addresses/:id` 👤
Delete a saved address by ID.

**Response `200`** `{ "success": true, "message": "Address deleted" }`

---

## 2. Products (`/api/products`)

### `GET /api/products` 🌐
Paginated product catalog.

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default `1`) |
| `limit` | integer | Results per page (max `50`) |
| `search` | string | Full-text search on name/SKU |
| `categoryId` | UUID | Filter by category |
| `audience` | `MEN\|WOMEN\|UNISEX` | Filter by audience |
| `shoeType` | string | Filter by shoe type |
| `minPrice` | integer | Min price in centavos |
| `maxPrice` | integer | Max price in centavos |
| `inStock` | boolean | Filter in-stock only |
| `isFeatured` | boolean | Filter featured only |
| `brand` | string | Filter by brand **slug** |
| `sortBy` | `newest\|price_asc\|price_desc\|popular` | Sort order |

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "uuid", "name": "...", "slug": "...", "basePriceCentavos": 459900,
    "brand": { "id": "uuid", "name": "...", "slug": "..." },
    "seller": { "id": "uuid", "storeName": "..." },
    "category": { "id": "uuid", "name": "..." },
    "images": [{ "url": "...", "isPrimary": true }],
    "_count": { "variants": 6 }
  }],
  "pagination": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

---

### `GET /api/products/featured` 🌐
Returns up to 8 featured products. No query parameters required.

---

### `GET /api/products/filters` 🌐
Returns available filter facets (categories, audiences, shoe types, size/color options, price range).

---

### `GET /api/products/:slug` 🌐
Full product detail by slug, including all variants, images, brand, and seller store name.

**Response `200`** Full product object.  
**Errors**: `404` not found or inactive.

---

## 3. Brands (`/api/brands`)

### `GET /api/brands` 🌐
List all active brands.

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "uuid", "name": "STRIDERA Lab", "slug": "stridera-lab",
    "description": "...", "logoUrl": "...",
    "seller": { "storeName": "...", "sellerStatus": "APPROVED" },
    "_count": { "products": 12 }
  }]
}
```

---

### `GET /api/brands/:slug` 🌐
Brand storefront page data: brand details + paginated products belonging to that brand.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "brand": { "id": "uuid", "name": "...", "slug": "...", "description": "...", "seller": { "storeName": "..." } },
    "products": [ /* product objects */ ],
    "pagination": { "page": 1, "total": 8, "pages": 1 }
  }
}
```

---

## 4. Cart (`/api/cart`)

> Cart is session-based for guests (cookie `cart_session`) and user-linked for authenticated accounts.

### `GET /api/cart` 🌐
Get the current cart with items, unit prices, and line totals.

### `POST /api/cart/items` 🌐
Add a variant to the cart.

**Request body**: `{ "productVariantId": "uuid", "quantity": 2 }`

### `PATCH /api/cart/items/:itemId` 🌐
Update quantity of a cart item.

**Request body**: `{ "quantity": 3 }`

### `DELETE /api/cart/items/:itemId` 🌐
Remove a cart item.

### `DELETE /api/cart` 🌐
Clear the entire cart.

---

## 5. Orders (`/api/orders`)

### `POST /api/orders` 🌐
**Checkout** — create an order from the active cart. Atomically partitions items into `SellerOrder` slices per merchant inside a database transaction. Stock is **not** decremented here — it is decremented upon payment confirmation.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `shippingFullName` | string | ✓ |
| `shippingPhone` | string | ✓ |
| `shippingAddressLine1` | string | ✓ |
| `shippingAddressLine2` | string | – |
| `shippingCity` | string | ✓ |
| `shippingProvince` | string | ✓ |
| `shippingPostalCode` | string | ✓ |
| `shippingCountry` | string | – (default `PH`) |
| `guestEmail` | string | ✓ if guest |
| `promotionCode` | string | – |
| `notes` | string | – |

**Response `201`**
```json
{
  "success": true,
  "data": {
    "orderId": "uuid",
    "orderNumber": "STR-20261028-ABC12",
    "grandTotalCentavos": 919800,
    "sellerOrders": [
      { "id": "uuid", "sellerId": "uuid", "subtotalCentavos": 459900, "itemCount": 1 }
    ]
  }
}
```

**Errors**: `400` empty cart / out-of-stock / validation | `409` duplicate order

---

### `GET /api/orders` 👤
Order history for the authenticated user.

**Query params**: `page`, `limit`, `status`

---

### `GET /api/orders/:orderNumber` 👤
Order detail including items, seller slices, payment status, and shipping.

---

### `PATCH /api/orders/:orderNumber/cancel` 👤
Cancel an UNPAID order. PAID orders can only be cancelled at the slice level by sellers or by admin.

---

## 6. Payments (`/api/payments`)

### `POST /api/payments/create-session` 👤
Create a PayMongo checkout session for an existing PENDING order.

**Request body**: `{ "orderNumber": "STR-20261028-ABC12" }`

**Response `200`**
```json
{
  "success": true,
  "data": { "paymentId": "uuid", "checkoutUrl": "https://pm.link/...", "status": "PENDING" }
}
```

**Errors**: `400` already paid | `404` order not found | `403` not your order

---

### `POST /api/payments/webhook` 🌐
PayMongo signed webhook receiver. Validates `Paymongo-Signature` header using HMAC-SHA256 with `PAYMONGO_WEBHOOK_SECRET`. Idempotently processes `payment.paid`, `payment.failed`, `payment.cancelled` events. On `payment.paid`, marks parent `Order` and all child `SellerOrder` slices as `PAID` and decrements stock inside a transaction.

**Headers required**: `Paymongo-Signature: t=<timestamp>,te=<hmac>`

**Response `200`** `{ "received": true }`  
**Errors**: `400` bad signature | `400` amount mismatch | `200` already processed (idempotent)

---

### `POST /api/payments/simulate` 🔑
Demo-mode fallback to mark an order as paid without going through PayMongo. **Guard**: requires `DEMO_MODE=true` environment variable AND admin role. Emits an audit log entry.

**Request body**: `{ "orderNumber": "STR-20261028-ABC12" }`

**Response `200`**
```json
{ "success": true, "message": "Payment simulated", "data": { "orderNumber": "...", "paymentStatus": "PAID" } }
```

**Errors**: `403` not admin or `DEMO_MODE` not set | `400` already paid

---

### `GET /api/payments/:paymentId` 👤
Get payment record by ID. Owner or admin only.

---

## 7. Seller (`/api/seller`)

> All seller endpoints require an authenticated user with `role = SELLER` and `sellerStatus = APPROVED`. Pending sellers receive `403`. Non-sellers receive `404`.

### `GET /api/seller/profile` 🏪
Return seller profile: store name, description, brand, seller status.

### `PUT /api/seller/profile` 🏪
Update store name or description.

**Request body**: `{ "storeName": "...", "storeDescription": "..." }`

---

### `GET /api/seller/dashboard` 🏪
Aggregated KPI metrics for the merchant hub.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "productCount": 12,
    "pendingOrders": 3,
    "paidOrders": 28,
    "shippedOrders": 15,
    "totalRevenueCentavos": 58450000,
    "recentOrders": [ /* last 5 SellerOrder slices */ ],
    "lowStockVariants": [ /* variants with stock < 5 */ ]
  }
}
```

---

### `GET /api/seller/products` 🏪
List own products (tenant-isolated). Accepts `page`, `limit`, `search`.

### `GET /api/seller/products/:id` 🏪
Own product detail. Returns `404` if the product belongs to another seller.

### `POST /api/seller/products` 🏪
Create a new product under the seller's account.

**Request body**: same shape as admin product creation (see §8) plus product is automatically assigned `sellerId = req.user.id`.

### `PUT /api/seller/products/:id` 🏪
Update own product. Returns `404` for alien products.

### `DELETE /api/seller/products/:id` 🏪
Deactivate own product. Returns `404` for alien products.

### `POST /api/seller/products/:id/variants` 🏪
Add a variant to an own product.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `size` | string | ✓ |
| `color` | string | ✓ |
| `colorHex` | string | – |
| `variantSku` | string | ✓ |
| `priceOverrideCentavos` | integer | – |
| `stockQuantity` | integer | ✓ (≥ 0) |

---

### `PATCH /api/seller/variants/:variantId/stock` 🏪
Adjust stock for a variant owned by the seller. `reason` is mandatory and must be a non-empty string.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `newQuantity` | integer | ✓ (≥ 0) |
| `reason` | string | ✓ |

**Response `200`** Updated variant + stock movement record.  
**Errors**: `400` missing reason | `400` negative quantity | `404` variant not found or alien

---

### `GET /api/seller/orders` 🏪
Own SellerOrder slices. Accepts `status` filter and `page`/`limit`.

### `GET /api/seller/orders/:id` 🏪
Own SellerOrder detail. Returns `404` for alien slices.

### `PATCH /api/seller/orders/:id/fulfill` 🏪
Mark a PAID slice as SHIPPED with tracking.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `trackingNumber` | string | – |
| `trackingUrl` | string | – |

**Response `200`** Updated SellerOrder.  
**Errors**: `400` slice not PAID | `404` alien slice

### `PATCH /api/seller/orders/:id/cancel` 🏪
Cancel a PAID slice (reason required). Atomically restores variant stock and records `ORDER_CANCELLED` stock movement.

**Request body**: `{ "reason": "Item damaged in packaging" }`

**Response `200`** Updated SellerOrder + restored stock quantities.  
**Errors**: `400` missing reason | `400` slice not PAID | `404` alien slice

---

## 8. Admin (`/api/admin`)

> All admin endpoints require `role = ADMIN`. Returns `403` for non-admins.

### Product Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/products` | List all products (active + inactive). Query: `page`, `limit`, `search`, `categoryId`, `isActive` |
| `GET` | `/api/admin/products/:id` | Full product with variants and images |
| `POST` | `/api/admin/products` | Create product |
| `PUT` | `/api/admin/products/:id` | Update product |
| `DELETE` | `/api/admin/products/:id` | Deactivate product |
| `POST` | `/api/admin/products/:id/variants` | Add variant |
| `PATCH` | `/api/admin/variants/:variantId/stock` | Adjust stock (requires `reason`) |

**POST /api/admin/products request body**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | ✓ |
| `sku` | string | ✓ |
| `categoryId` | UUID | ✓ |
| `description` | string | – |
| `features` | string | – |
| `basePriceCentavos` | integer | ✓ |
| `compareAtPriceCentavos` | integer | – |
| `audience` | `MEN\|WOMEN\|UNISEX` | ✓ |
| `shoeType` | string | ✓ |
| `isActive` | boolean | – |
| `isFeatured` | boolean | – |
| `brandId` | UUID | – |
| `sellerId` | UUID | – |

---

### Category Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/categories` | Create category |
| `PUT` | `/api/admin/categories/:id` | Update category |

---

### Order Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/orders` | All orders. Query: `status`, `paymentStatus`, `page`, `limit` |
| `PATCH` | `/api/admin/orders/:orderNumber/status` | Update order + all child slice statuses |

---

### Promotion Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/promotions` | List all promo codes |
| `POST` | `/api/admin/promotions` | Create promo code |
| `PATCH` | `/api/admin/promotions/:id` | Update / deactivate promo code |

---

### Customer Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/customers` | List all customer accounts |

---

### Reports & Audit

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/reports/sales` | Revenue, order count, top products by date range |
| `GET` | `/api/admin/audit-logs` | Paginated audit log (action, entity, user, timestamp) |
| `GET` | `/api/admin/payment-logs` | Payment records with provider references and demo flag |

---

### Seller Governance

#### `GET /api/admin/sellers` 🔑
List all seller accounts with status filter.

**Query params**: `status` (`PENDING|APPROVED|REJECTED|SUSPENDED`)

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "uuid", "email": "...", "storeName": "...", "sellerStatus": "PENDING",
    "brand": { "name": "..." }, "createdAt": "..." }]
}
```

---

#### `PATCH /api/admin/sellers/:id/status` 🔑
Approve, reject, or suspend a seller.

**Request body**: `{ "status": "APPROVED|REJECTED|SUSPENDED", "reason": "optional" }`

**Response `200`** Updated seller user object.

---

#### `POST /api/admin/sellers/:id/assign-brand` 🔑
Assign an existing brand to a seller.

**Request body**: `{ "brandId": "uuid" }`

**Response `200`** Updated brand with seller linkage.

---

### Brand Management

#### `GET /api/admin/brands` 🔑
List all brands with seller assignments and product counts.

#### `POST /api/admin/brands` 🔑
Create a brand. Optionally assign to a seller at creation time.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | ✓ |
| `slug` | string | ✓ |
| `description` | string | – |
| `logoUrl` | string | – |
| `bannerUrl` | string | – |
| `sellerId` | UUID | – |

---

### Platform Configuration & Health

#### `GET /api/admin/config-status` 🔑
Returns masked configuration status for demo presentation. Secrets are never returned raw; they are truncated to `sk_test_...abcd` / `wh_...wxyz` format. PostgreSQL URL hostname is shown; password and port are masked.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "environment": "development",
    "demoMode": true,
    "paymongoKey": { "set": true, "preview": "sk_test_...abcd" },
    "paymongoWebhookSecret": { "set": true, "preview": "wh_...wxyz" },
    "databaseUrl": { "set": true, "host": "localhost", "database": "stridera_db" },
    "jwtSecret": { "set": true }
  }
}
```

---

## 9. Wishlist (`/api/wishlist`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/wishlist` | 👤 | List wishlist products |
| `POST` | `/api/wishlist` | 👤 | Add product to wishlist. Body: `{ "productId": "uuid" }` |
| `DELETE` | `/api/wishlist/:productId` | 👤 | Remove product from wishlist |

---

## 10. Categories (`/api/categories`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/categories` | 🌐 | List active categories |
| `GET` | `/api/categories/:slug` | 🌐 | Category detail with products |

---

## Appendix: Centavos Money Convention

All monetary values in requests and responses are **integer centavos** (smallest PHP unit). No floating-point values are ever accepted or returned for money fields.

| Display | API value |
|---------|-----------|
| ₱4,599.00 | `459900` |
| ₱100.00 | `10000` |
| ₱0.50 | `50` |

Conversion: `display = centavos / 100`

---

## Appendix: Seller Order Status Machine

```
PENDING → (payment webhook / simulate) → PAID
PAID    → (seller fulfills)            → SHIPPED
PAID    → (seller cancels)             → CANCELLED  ← stock restored here
SHIPPED → (delivery confirmed)         → DELIVERED
```

Cross-seller lookups at any step return `404 Not Found` (not `403`) to preserve confidentiality per tenant isolation policy.

