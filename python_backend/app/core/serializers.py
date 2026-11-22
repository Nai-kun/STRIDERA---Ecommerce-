"""Shared JSON serializers producing camelCase payloads compatible with STRIDERA's Next.js frontend."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def to_iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def format_peso(centavos: int | None) -> str:
    return f"₱{((centavos or 0) / 100):.2f}"


def serialize_address(addr: Any) -> dict[str, Any]:
    return {
        "id": addr.id,
        "userId": addr.user_id,
        "label": addr.label,
        "fullName": addr.full_name,
        "phone": addr.phone,
        "addressLine1": addr.address_line1,
        "addressLine2": addr.address_line2,
        "barangay": addr.barangay,
        "city": addr.city,
        "province": addr.province,
        "region": addr.region,
        "regionCode": addr.region_code,
        "provinceCode": addr.province_code,
        "cityCode": addr.city_code,
        "barangayCode": addr.barangay_code,
        "addressSource": addr.address_source,
        "postalCode": addr.postal_code,
        "country": addr.country,
        "isDefault": addr.is_default,
        "createdAt": to_iso_utc(addr.created_at),
        "updatedAt": to_iso_utc(addr.updated_at),
    }


def serialize_brand_summary(brand: Any) -> dict[str, Any] | None:
    if not brand:
        return None
    return {
        "id": brand.id,
        "name": brand.name,
        "slug": brand.slug,
        "description": brand.description,
        "logoUrl": brand.logo_url,
    }


def serialize_user(
    user: Any,
    *,
    include_phone: bool = True,
    include_brand: bool = False,
    include_addresses: bool = False,
    include_dates: bool = False,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": user.id,
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "role": user.role,
        "accountStatus": user.account_status,
        "sellerStatus": user.seller_status,
        "storeName": user.store_name,
        "storeDescription": user.store_description,
        "storeLogoUrl": user.store_logo_url,
        "identificationDetails": user.identification_details,
    }
    if include_phone:
        data["phone"] = user.phone
    if include_dates:
        data["createdAt"] = to_iso_utc(user.created_at)
        data["lastLoginAt"] = to_iso_utc(user.last_login_at)
        data["lastSeenAt"] = to_iso_utc(user.last_seen_at)
    if include_brand:
        data["brand"] = serialize_brand_summary(getattr(user, "brand", None))
    if include_addresses:
        addrs = sorted(
            getattr(user, "addresses", []) or [],
            key=lambda a: (not a.is_default, a.created_at or datetime.min),
        )
        data["addresses"] = [serialize_address(a) for a in addrs]
    return data


def serialize_product_image(img: Any) -> dict[str, Any]:
    return {
        "id": img.id,
        "productId": img.product_id,
        "url": img.url,
        "altText": img.alt_text,
        "sortOrder": img.sort_order,
        "isPrimary": img.is_primary,
        "createdAt": to_iso_utc(img.created_at),
    }


def serialize_variant(v: Any) -> dict[str, Any]:
    return {
        "id": v.id,
        "productId": v.product_id,
        "variantSku": v.variant_sku,
        "size": v.size,
        "color": v.color,
        "colorHex": v.color_hex,
        "priceOverrideCentavos": v.price_override_centavos,
        "stockQuantity": v.stock_quantity,
        "lowStockThreshold": v.low_stock_threshold,
        "isActive": v.is_active,
        "createdAt": to_iso_utc(v.created_at),
        "updatedAt": to_iso_utc(v.updated_at),
    }


def serialize_order_item(item: Any, include_product_image: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": item.id,
        "orderId": item.order_id,
        "sellerOrderId": item.seller_order_id,
        "productVariantId": item.product_variant_id,
        "productName": item.product_name,
        "variantSku": item.variant_sku,
        "size": item.size,
        "color": item.color,
        "unitPriceCentavos": item.unit_price_centavos,
        "quantity": item.quantity,
        "lineTotalCentavos": item.line_total_centavos,
        "fulfillmentStatus": item.fulfillment_status,
        "shippedAt": to_iso_utc(item.shipped_at),
        "stockConflict": item.stock_conflict,
        "createdAt": to_iso_utc(item.created_at),
    }
    if include_product_image and getattr(item, "product_variant", None) and getattr(item.product_variant, "product", None):
        prod = item.product_variant.product
        imgs = sorted(prod.images or [], key=lambda im: (not im.is_primary, im.sort_order))
        data["productVariant"] = {
            "id": item.product_variant.id,
            "product": {
                "id": prod.id,
                "name": prod.name,
                "slug": prod.slug,
                "sellerId": prod.seller_id,
                "images": [{"url": im.url, "altText": im.alt_text, "isPrimary": im.is_primary} for im in imgs[:1]],
            },
        }
    return data


def serialize_payment(p: Any) -> dict[str, Any]:
    return {
        "id": p.id,
        "orderId": p.order_id,
        "provider": p.provider,
        "paymentMethod": p.payment_method,
        "providerPaymentId": p.provider_payment_id,
        "providerCheckoutUrl": p.provider_checkout_url,
        "idempotencyKey": p.idempotency_key,
        "amountCentavos": p.amount_centavos,
        "amountFormatted": format_peso(p.amount_centavos),
        "currency": p.currency,
        "status": p.status,
        "isDemo": p.is_demo,
        "webhookEventId": p.webhook_event_id,
        "verifiedAt": to_iso_utc(p.verified_at),
        "financeVerified": p.finance_verified,
        "financeVerifiedBy": p.finance_verified_by,
        "financeVerifiedAt": to_iso_utc(p.finance_verified_at),
        "createdAt": to_iso_utc(p.created_at),
        "updatedAt": to_iso_utc(p.updated_at),
    }


def serialize_shipment(s: Any) -> dict[str, Any]:
    dp = getattr(s, "delivery_personnel", None)
    return {
        "id": s.id,
        "orderId": s.order_id,
        "sellerOrderId": s.seller_order_id,
        "deliveryPersonnelId": s.delivery_personnel_id,
        "deliveryPersonnel": {
            "id": dp.id,
            "firstName": dp.first_name,
            "lastName": dp.last_name,
            "phone": dp.phone,
        } if dp else None,
        "carrier": s.carrier,
        "trackingNumber": s.tracking_number,
        "trackingUrl": s.tracking_url,
        "status": s.status,
        "shippingFeeCentavos": s.shipping_fee_centavos,
        "notes": s.notes,
        "proofOfDeliveryUrl": s.proof_of_delivery_url,
        "recipientName": s.recipient_name,
        "failureReason": s.failure_reason,
        "history": s.history,
        "acceptedAt": to_iso_utc(s.accepted_at),
        "collectedAt": to_iso_utc(s.collected_at),
        "shippedAt": to_iso_utc(s.shipped_at),
        "deliveredAt": to_iso_utc(s.delivered_at),
        "createdAt": to_iso_utc(s.created_at),
        "updatedAt": to_iso_utc(s.updated_at),
    }


def serialize_order(
    order: Any,
    *,
    include_items: bool = True,
    include_payments: bool = True,
    include_shipments: bool = True,
    include_seller_orders: bool = False,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": order.id,
        "orderNumber": order.order_number,
        "userId": order.user_id,
        "guestEmail": order.guest_email,
        "orderStatus": order.order_status,
        "paymentStatus": order.payment_status,
        "paymentMethod": order.payment_method,
        "shippingStatus": order.shipping_status,
        "subtotalCentavos": order.subtotal_centavos,
        "discountTotalCentavos": order.discount_total_centavos,
        "shippingFeeCentavos": order.shipping_fee_centavos,
        "grandTotalCentavos": order.grand_total_centavos,
        "subtotalFormatted": format_peso(order.subtotal_centavos),
        "discountFormatted": format_peso(order.discount_total_centavos),
        "shippingFormatted": format_peso(order.shipping_fee_centavos),
        "grandTotalFormatted": format_peso(order.grand_total_centavos),
        "shippingFullName": order.shipping_full_name,
        "shippingPhone": order.shipping_phone,
        "shippingAddressLine1": order.shipping_address_line1,
        "shippingAddressLine2": order.shipping_address_line2,
        "shippingBarangay": order.shipping_barangay,
        "shippingCity": order.shipping_city,
        "shippingProvince": order.shipping_province,
        "shippingRegion": order.shipping_region,
        "shippingRegionCode": order.shipping_region_code,
        "shippingProvinceCode": order.shipping_province_code,
        "shippingCityCode": order.shipping_city_code,
        "shippingBarangayCode": order.shipping_barangay_code,
        "shippingAddressSource": order.shipping_address_source,
        "shippingPostalCode": order.shipping_postal_code,
        "shippingCountry": order.shipping_country,
        "estimatedDeliveryStart": order.estimated_delivery_start,
        "estimatedDeliveryEnd": order.estimated_delivery_end,
        "deliveryZone": order.delivery_zone,
        "deliveryScheduleSource": order.delivery_schedule_source,
        "deliveryHolidaysObserved": order.delivery_holidays_observed,
        "promotionId": order.promotion_id,
        "notes": order.notes,
        "stockDecremented": order.stock_decremented,
        "receivedConfirmedAt": to_iso_utc(order.received_confirmed_at),
        "createdAt": to_iso_utc(order.created_at),
        "updatedAt": to_iso_utc(order.updated_at),
    }
    if include_items:
        data["items"] = [serialize_order_item(i, include_product_image=True) for i in (order.items or [])]
    if include_payments:
        data["payments"] = [serialize_payment(p) for p in (order.payments or [])]
    if include_shipments:
        data["shipments"] = [serialize_shipment(s) for s in (order.shipments or [])]
    if include_seller_orders:
        sos = []
        for so in (order.seller_orders or []):
            seller_obj = getattr(so, "seller", None)
            sos.append({
                "id": so.id,
                "orderId": so.order_id,
                "sellerId": so.seller_id,
                "subtotalCentavos": so.subtotal_centavos,
                "status": so.status,
                "carrier": so.carrier,
                "trackingNumber": so.tracking_number,
                "trackingUrl": so.tracking_url,
                "acceptedAt": to_iso_utc(so.accepted_at),
                "shippedAt": to_iso_utc(so.shipped_at),
                "deliveredAt": to_iso_utc(so.delivered_at),
                "notes": so.notes,
                "seller": {
                    "id": seller_obj.id,
                    "storeName": seller_obj.store_name,
                    "storeLogoUrl": seller_obj.store_logo_url,
                } if seller_obj else None,
            })
        data["sellerOrders"] = sos
    return data
