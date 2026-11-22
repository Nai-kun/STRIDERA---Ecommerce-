"""SQLAlchemy 2.0 relational ORM models mapped directly to STRIDERA's PostgreSQL tables & enums."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


USER_ROLE_ENUM = SAEnum(
    "CUSTOMER", "SELLER", "ADMIN", "INVENTORY_MANAGER", "DELIVERY_PERSONNEL", "CUSTOMER_SUPPORT", "FINANCE_OFFICER",
    name="UserRole",
    create_type=False,
)
ACCOUNT_STATUS_ENUM = SAEnum("ACTIVE", "DEACTIVATED", "SUSPENDED", name="AccountStatus", create_type=False)
SELLER_STATUS_ENUM = SAEnum("PENDING", "APPROVED", "REJECTED", "SUSPENDED", name="SellerStatus", create_type=False)
SELLER_ORDER_STATUS_ENUM = SAEnum(
    "PENDING", "PAID", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED",
    name="SellerOrderStatus",
    create_type=False,
)
AUDIENCE_ENUM = SAEnum("MEN", "WOMEN", "UNISEX", name="Audience", create_type=False)
SHOE_TYPE_ENUM = SAEnum(
    "RUNNING", "LIFESTYLE", "BASKETBALL", "TRAINING", "CASUAL", "BOOTS", "FORMAL", "LOAFERS",
    name="ShoeType",
    create_type=False,
)
PRODUCT_STATUS_ENUM = SAEnum("ACTIVE", "DRAFT", "ARCHIVED", name="ProductStatus", create_type=False)
ITEM_FULFILLMENT_ENUM = SAEnum("PENDING", "SHIPPED", "CANCELLED", name="ItemFulfillmentStatus", create_type=False)
ORDER_STATUS_ENUM = SAEnum(
    "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURN_REQUESTED", "RETURNED",
    name="OrderStatus",
    create_type=False,
)
PAYMENT_STATUS_ENUM = SAEnum("UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED", name="PaymentStatus", create_type=False)
SHIPPING_STATUS_ENUM = SAEnum(
    "UNFULFILLED", "PREPARING", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURN_PENDING",
    name="ShippingStatus",
    create_type=False,
)
PAYMENT_PROVIDER_STATUS_ENUM = SAEnum(
    "PENDING", "PAID", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED",
    name="PaymentProviderStatus",
    create_type=False,
)
SHIPMENT_STATUS_ENUM = SAEnum(
    "PREPARING", "ASSIGNED", "COLLECTED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURN_PENDING",
    name="ShipmentStatus",
    create_type=False,
)
DISCOUNT_TYPE_ENUM = SAEnum("FLAT", "PERCENTAGE", name="DiscountType", create_type=False)
TICKET_CATEGORY_ENUM = SAEnum(
    "INQUIRY", "COMPLAINT", "CANCELLATION", "RETURN", "REFUND",
    name="TicketCategory",
    create_type=False,
)
TICKET_STATUS_ENUM = SAEnum("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", name="TicketStatus", create_type=False)
REFUND_STATUS_ENUM = SAEnum("NONE", "PENDING", "APPROVED", "REJECTED", "COMPLETED", name="RefundStatus", create_type=False)
PAYOUT_STATUS_ENUM = SAEnum("PENDING", "COMPLETED", "SIMULATED", name="PayoutStatus", create_type=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(USER_ROLE_ENUM, default="CUSTOMER", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    account_status: Mapped[str] = mapped_column(ACCOUNT_STATUS_ENUM, default="ACTIVE", nullable=False)
    seller_status: Mapped[str | None] = mapped_column(SELLER_STATUS_ENUM, nullable=True)
    store_name: Mapped[str | None] = mapped_column(String, nullable=True)
    store_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    identification_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_token_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    addresses: Mapped[list[Address]] = relationship("Address", back_populates="user", cascade="all, delete-orphan")
    brand: Mapped[Brand | None] = relationship("Brand", back_populates="seller", uselist=False)


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    address_line1: Mapped[str] = mapped_column(String, nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String, nullable=True)
    barangay: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String, nullable=False)
    province: Mapped[str] = mapped_column(String, nullable=False)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    region_code: Mapped[str | None] = mapped_column(String, nullable=True)
    province_code: Mapped[str | None] = mapped_column(String, nullable=True)
    city_code: Mapped[str | None] = mapped_column(String, nullable=True)
    barangay_code: Mapped[str | None] = mapped_column(String, nullable=True)
    address_source: Mapped[str] = mapped_column(String, default="MANUAL", nullable=False)
    postal_code: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String, default="PH", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="addresses")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    seller_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    seller: Mapped[User | None] = relationship("User", back_populates="brand")
    products: Mapped[list[Product]] = relationship("Product", back_populates="brand")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    products: Mapped[list[Product]] = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    category_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("categories.id"), nullable=False)
    seller_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    brand_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("brands.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    sku: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    features: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_price_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    compare_at_price_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audience: Mapped[str] = mapped_column(AUDIENCE_ENUM, nullable=False)
    shoe_type: Mapped[str] = mapped_column(SHOE_TYPE_ENUM, nullable=False)
    status: Mapped[str] = mapped_column(PRODUCT_STATUS_ENUM, default="ACTIVE", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    category: Mapped[Category] = relationship("Category", back_populates="products")
    seller: Mapped[User | None] = relationship("User")
    brand: Mapped[Brand | None] = relationship("Brand", back_populates="products")
    variants: Mapped[list[ProductVariant]] = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    images: Mapped[list[ProductImage]] = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    reviews: Mapped[list[ProductReview]] = relationship("ProductReview", back_populates="product", cascade="all, delete-orphan")
    wishlist_items: Mapped[list[WishlistItem]] = relationship("WishlistItem", back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_sku: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    size: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    color_hex: Mapped[str | None] = mapped_column(String, nullable=True)
    price_override_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="variants")
    stock_movements: Mapped[list[StockMovement]] = relationship("StockMovement", back_populates="product_variant")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="images")


class ProductReview(Base):
    __tablename__ = "product_reviews"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    order_number: Mapped[str | None] = mapped_column(String, nullable=True)
    rating: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    seller_rating: Mapped[int | None] = mapped_column(Integer, default=5, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="reviews")
    user: Mapped[User] = relationship("User")


class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    items: Mapped[list[CartItem]] = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    cart_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("carts.id", ondelete="CASCADE"), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("product_variants.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    cart: Mapped[Cart] = relationship("Cart", back_populates="items")
    product_variant: Mapped[ProductVariant] = relationship("ProductVariant")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    guest_email: Mapped[str | None] = mapped_column(String, nullable=True)
    order_status: Mapped[str] = mapped_column(ORDER_STATUS_ENUM, default="PENDING", nullable=False)
    payment_status: Mapped[str] = mapped_column(PAYMENT_STATUS_ENUM, default="UNPAID", nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String, default="gcash", nullable=True)
    shipping_status: Mapped[str] = mapped_column(SHIPPING_STATUS_ENUM, default="UNFULFILLED", nullable=False)
    subtotal_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_total_centavos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shipping_fee_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    grand_total_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    shipping_full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_address_line1: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_address_line2: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_barangay: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_city: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_province: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_region: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_region_code: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_province_code: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_city_code: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_barangay_code: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_address_source: Mapped[str] = mapped_column(String, default="MANUAL", nullable=False)
    shipping_postal_code: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_country: Mapped[str | None] = mapped_column(String, nullable=True)
    estimated_delivery_start: Mapped[str | None] = mapped_column(String, nullable=True)
    estimated_delivery_end: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_zone: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_schedule_source: Mapped[str] = mapped_column(String, default="UNAVAILABLE", nullable=False)
    delivery_holidays_observed: Mapped[list | dict | None] = mapped_column(JSONB, nullable=True)
    promotion_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("promotions.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    stock_decremented: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    received_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    user: Mapped[User | None] = relationship("User")
    promotion: Mapped[Promotion | None] = relationship("Promotion")
    items: Mapped[list[OrderItem]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list[Payment]] = relationship("Payment", back_populates="order")
    shipments: Mapped[list[Shipment]] = relationship("Shipment", back_populates="order")
    seller_orders: Mapped[list[SellerOrder]] = relationship("SellerOrder", back_populates="order")
    support_tickets: Mapped[list[SupportTicket]] = relationship("SupportTicket", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    seller_order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("seller_orders.id"), nullable=True)
    product_variant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("product_variants.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    variant_sku: Mapped[str] = mapped_column(String, nullable=False)
    size: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    unit_price_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    fulfillment_status: Mapped[str] = mapped_column(ITEM_FULFILLMENT_ENUM, default="PENDING", nullable=False)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stock_conflict: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    order: Mapped[Order] = relationship("Order", back_populates="items")
    seller_order: Mapped[SellerOrder | None] = relationship("SellerOrder", back_populates="items")
    product_variant: Mapped[ProductVariant] = relationship("ProductVariant")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String, default="ewallet_sandbox", nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String, default="gcash", nullable=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_checkout_url: Mapped[str | None] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    amount_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String, default="PHP", nullable=False)
    status: Mapped[str] = mapped_column(PAYMENT_PROVIDER_STATUS_ENUM, default="PENDING", nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    webhook_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finance_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    finance_verified_by: Mapped[str | None] = mapped_column(String, nullable=True)
    finance_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    order: Mapped[Order] = relationship("Order", back_populates="payments")


class SellerOrder(Base):
    __tablename__ = "seller_orders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), nullable=False)
    seller_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    subtotal_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(SELLER_ORDER_STATUS_ENUM, default="PENDING", nullable=False)
    carrier: Mapped[str | None] = mapped_column(String, nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String, nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    order: Mapped[Order] = relationship("Order", back_populates="seller_orders")
    seller: Mapped[User] = relationship("User")
    items: Mapped[list[OrderItem]] = relationship("OrderItem", back_populates="seller_order")
    shipments: Mapped[list[Shipment]] = relationship("Shipment", back_populates="seller_order")


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), nullable=False)
    seller_order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("seller_orders.id"), nullable=True)
    delivery_personnel_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    carrier: Mapped[str | None] = mapped_column(String, nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String, nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(SHIPMENT_STATUS_ENUM, default="PREPARING", nullable=False)
    shipping_fee_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_of_delivery_url: Mapped[str | None] = mapped_column(String, nullable=True)
    recipient_name: Mapped[str | None] = mapped_column(String, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    history: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    order: Mapped[Order] = relationship("Order", back_populates="shipments")
    seller_order: Mapped[SellerOrder | None] = relationship("SellerOrder", back_populates="shipments")
    delivery_personnel: Mapped[User | None] = relationship("User")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    ticket_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), nullable=True)
    seller_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    assigned_to_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    category: Mapped[str] = mapped_column(TICKET_CATEGORY_ENUM, default="INQUIRY", nullable=False)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(TICKET_STATUS_ENUM, default="OPEN", nullable=False)
    priority: Mapped[str] = mapped_column(String, default="MEDIUM", nullable=False)
    refund_amount_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    refund_status: Mapped[str] = mapped_column(REFUND_STATUS_ENUM, default="NONE", nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    user: Mapped[User] = relationship("User", foreign_keys=[user_id])
    order: Mapped[Order | None] = relationship("Order", back_populates="support_tickets")
    assigned_to: Mapped[User | None] = relationship("User", foreign_keys=[assigned_to_id])
    messages: Mapped[list[SupportMessage]] = relationship("SupportMessage", back_populates="ticket", cascade="all, delete-orphan")


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    ticket_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    sender_role: Mapped[str] = mapped_column(String, nullable=False)
    sender_name: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    ticket: Mapped[SupportTicket] = relationship("SupportTicket", back_populates="messages")


class SellerPayout(Base):
    __tablename__ = "seller_payouts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    payout_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    seller_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    gross_sales_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_fee_percent: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    platform_fee_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    net_amount_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String, default="gcash", nullable=False)
    reference_number: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(PAYOUT_STATUS_ENUM, default="COMPLETED", nullable=False)
    processed_by_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    seller: Mapped[User] = relationship("User", foreign_keys=[seller_id])
    processed_by: Mapped[User | None] = relationship("User", foreign_keys=[processed_by_id])


class PlatformConfig(Base):
    __tablename__ = "platform_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="default")
    platform_fee_percent: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    shipping_fee_centavos: Mapped[int] = mapped_column(Integer, default=15000, nullable=False)
    free_shipping_threshold_centavos: Mapped[int] = mapped_column(Integer, default=300000, nullable=False)
    enabled_wallets: Mapped[str] = mapped_column(String, default="gcash,maya,paypal", nullable=False)
    sandbox_mode: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)


class Promotion(Base):
    __tablename__ = "promotions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    discount_type: Mapped[str] = mapped_column(DISCOUNT_TYPE_ENUM, nullable=False)
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_discount_centavos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    times_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="wishlist_items")


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    product_variant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("product_variants.id"), nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_after: Mapped[int] = mapped_column(Integer, nullable=False)
    movement_type: Mapped[str] = mapped_column(String, default="ADJUSTMENT", nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    product_variant: Mapped[ProductVariant] = relationship("ProductVariant", back_populates="stock_movements")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    old_values: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    user: Mapped[User | None] = relationship("User")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    is_secret: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String, default="paymongo", nullable=False)
    event_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    event_type: Mapped[str | None] = mapped_column(String, nullable=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String, default="RECEIVED", nullable=False)
    redacted_payload: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
