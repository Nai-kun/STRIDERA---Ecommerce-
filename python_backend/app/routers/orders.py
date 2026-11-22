"""Order Creation, Multi-Seller Splitting, PSGC + Holiday Integration, History & Receipt Confirmation (/api/orders/*)."""

from __future__ import annotations

import logging
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

logger = logging.getLogger("stridera.orders")

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import get_current_user, get_optional_user, utcnow_naive
from ..core.serializers import format_peso, serialize_order
from ..core.validators import (
    collect_field_errors,
    normalize_ph_mobile,
    validate_city_or_province,
    validate_email,
    validate_optional_text,
    validate_person_name,
    validate_postal_code,
    validate_street,
    validation_error_response,
)
from ..models.models import (
    Cart,
    CartItem,
    Order,
    OrderItem,
    PlatformConfig,
    Product,
    ProductVariant,
    Promotion,
    SellerOrder,
    Shipment,
    StockMovement,
    User,
)
from ..services import holiday_client, psgc_client

router = APIRouter(prefix="/api/orders", tags=["Orders"])


def _generate_order_number() -> str:
    today = utcnow_naive().strftime("%Y%m%d")
    rand = uuid.uuid4().hex[:6].upper()
    return f"STR-{today}-{rand}"


def _load_full_order(db: Session, *, order_id: str | None = None, order_number: str | None = None) -> Order | None:
    q = (
        db.query(Order)
        .options(
            selectinload(Order.items)
            .selectinload(OrderItem.product_variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.images),
            selectinload(Order.payments),
            selectinload(Order.shipments).selectinload(Shipment.delivery_personnel),
            selectinload(Order.seller_orders).selectinload(SellerOrder.seller),
        )
        .execution_options(populate_existing=True)
    )
    if order_id:
        return q.filter(Order.id == order_id).first()
    if order_number:
        return q.filter(Order.order_number == order_number).first()
    return None


@router.post("")
async def create_order(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    nested = payload.get("shippingAddress") if isinstance(payload.get("shippingAddress"), dict) else {}

    class _AddrView:
        """Accept both nested `shippingAddress.{fullName,...}` and the flat
        `shippingFullName/shippingPhone/...` payload used by the web checkout."""

        _FLAT = {
            "fullName": "shippingFullName",
            "phone": "shippingPhone",
            "addressLine1": "shippingAddressLine1",
            "addressLine2": "shippingAddressLine2",
            "barangay": "shippingBarangay",
            "city": "shippingCity",
            "province": "shippingProvince",
            "region": "shippingRegion",
            "postalCode": "shippingPostalCode",
            "regionCode": "shippingRegionCode",
            "provinceCode": "shippingProvinceCode",
            "cityCode": "shippingCityCode",
            "barangayCode": "shippingBarangayCode",
            "addressSource": "shippingAddressSource",
        }

        def get(self, key, default=None):
            val = nested.get(key)
            if val is None or (isinstance(val, str) and not val.strip()):
                val = payload.get(self._FLAT.get(key, key))
            return default if val is None else val

    sa = _AddrView()
    guest_email_input = payload.get("guestEmail")
    shipping_full_name = sa.get("fullName")
    shipping_phone = sa.get("phone")
    addr1 = sa.get("addressLine1")
    addr2 = sa.get("addressLine2")
    city = sa.get("city")
    province = sa.get("province")
    postal = sa.get("postalCode")

    checks: dict[str, dict[str, Any]] = {
        "shippingFullName": validate_person_name(shipping_full_name, "Full name"),
        "shippingPhone": normalize_ph_mobile(shipping_phone, required=True),
        "shippingAddressLine1": validate_street(addr1),
        "shippingAddressLine2": validate_optional_text(addr2, "Address line 2", max_len=200),
        "shippingCity": validate_city_or_province(city, "City"),
        "shippingProvince": validate_city_or_province(province, "Province"),
        "shippingPostalCode": validate_postal_code(postal),
        "notes": validate_optional_text(payload.get("notes"), "Order notes", max_len=500),
    }
    if not user or guest_email_input is not None:
        checks["guestEmail"] = validate_email(guest_email_input, required=(not user), apply_policy=False)

    collected = collect_field_errors(checks)
    if not collected["ok"]:
        logger.warning(f"[Order] Validation failed: {collected.get('errors')}")
        return validation_error_response(collected)

    vals = collected["values"]
    resolved_guest_email = vals.get("guestEmail") if guest_email_input is not None else (user.email if user else None)

    resolved_city = vals["shippingCity"]
    resolved_province = vals["shippingProvince"]
    resolved_region = sa.get("region") or None
    resolved_barangay = sa.get("barangay") or None
    r_code = sa.get("regionCode") or None
    p_code = sa.get("provinceCode") or None
    c_code = sa.get("cityCode") or None
    b_code = sa.get("barangayCode") or None
    addr_source = "MANUAL_FALLBACK" if sa.get("addressSource") == "MANUAL_FALLBACK" else "MANUAL"

    if r_code or p_code or c_code or b_code:
        try:
            verified = await psgc_client.validate_address_hierarchy(
                region_code=r_code,
                province_code=p_code,
                city_code=c_code,
                barangay_code=b_code,
            )
        except psgc_client.PsgcError as exc:
            logger.warning(f"[Order] PSGC validation error: {exc}")
            return JSONResponse(
                status_code=exc.status_code or 400,
                content={
                    "success": False,
                    "code": exc.code or "PSGC_ERROR",
                    "message": str(exc),
                    "degraded": (exc.status_code or 500) >= 500,
                },
            )
        resolved_region = verified["regionName"]
        resolved_province = verified["provinceName"]
        resolved_city = verified["cityName"]
        resolved_barangay = verified["barangayName"] or resolved_barangay
        r_code = verified["regionCode"]
        p_code = verified["provinceCode"]
        c_code = verified["cityCode"]
        b_code = verified["barangayCode"]
        addr_source = "PSGC_VERIFIED"

    # Resolve cart for user or guest (fallback to guest session if user cart is empty)
    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    cart = None
    if user_id:
        cart = db.query(Cart).options(selectinload(Cart.items)).filter(Cart.user_id == user_id).first()
    if (not cart or not cart.items) and session_id:
        cart = db.query(Cart).options(selectinload(Cart.items)).filter(Cart.session_id == session_id).first()

    if not cart or not cart.items:
        logger.warning(f"[Order] Cart is empty or not found. user_id={user_id}, session_id={session_id}")
        raise HTTPException(status_code=400, detail="Your cart is empty")

    # Compute Nager.Date Holiday-Aware Delivery Estimate
    try:
        delivery_est = await holiday_client.calculate_delivery_estimate(
            region_code=r_code or "",
            province=resolved_province or "",
            city=resolved_city or "",
        )
    except Exception:
        delivery_est = {
            "estimatedDeliveryStart": None,
            "estimatedDeliveryEnd": None,
            "zone": "PROVINCIAL",
            "source": "UNAVAILABLE",
            "holidaysInWindow": [],
        }

    # Verify inventory, pricing, promotions & create order atomically
    subtotal_centavos = 0
    order_items_data: list[dict[str, Any]] = []

    for c_item in cart.items:
        variant = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == c_item.product_variant_id)
            .first()
        )
        if not variant or not variant.is_active or not variant.product.is_active or variant.product.status == "ARCHIVED":
            pname = variant.product.name if (variant and variant.product) else "Unknown"
            raise HTTPException(status_code=400, detail=f'Product "{pname}" is no longer available')

        if variant.stock_quantity < c_item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {variant.product.name} ({variant.size}/{variant.color}): only {variant.stock_quantity} available",
            )

        unit_price = variant.price_override_centavos or variant.product.base_price_centavos
        line_total = unit_price * c_item.quantity
        subtotal_centavos += line_total
        order_items_data.append({
            "productVariantId": variant.id,
            "productName": variant.product.name,
            "variantSku": variant.variant_sku,
            "size": variant.size,
            "color": variant.color,
            "unitPriceCentavos": unit_price,
            "quantity": c_item.quantity,
            "lineTotalCentavos": line_total,
            "_sellerId": variant.product.seller_id,
        })

    discount_centavos = 0
    promotion_id = None
    promo_code = str(payload.get("promotionCode") or "").strip().upper()
    if promo_code:
        promo = db.query(Promotion).filter(Promotion.code == promo_code).first()
        if not promo or not promo.is_active:
            raise HTTPException(status_code=400, detail="Invalid or expired promotion code")
        now = utcnow_naive()
        if promo.starts_at and now < promo.starts_at:
            raise HTTPException(status_code=400, detail="Promotion not yet active")
        if promo.expires_at and now > promo.expires_at:
            raise HTTPException(status_code=400, detail="Promotion has expired")
        if promo.usage_limit and promo.times_used >= promo.usage_limit:
            raise HTTPException(status_code=400, detail="Promotion usage limit reached")
        if promo.min_order_centavos and subtotal_centavos < promo.min_order_centavos:
            raise HTTPException(status_code=400, detail=f"Minimum order of {format_peso(promo.min_order_centavos)} required")

        if promo.discount_type == "PERCENTAGE":
            discount_centavos = (subtotal_centavos * promo.discount_value) // 100
        else:
            discount_centavos = promo.discount_value
        if promo.max_discount_centavos and discount_centavos > promo.max_discount_centavos:
            discount_centavos = promo.max_discount_centavos
        discount_centavos = min(discount_centavos, subtotal_centavos)
        promotion_id = promo.id
        promo.times_used += 1

    platform_cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    std_shipping = platform_cfg.shipping_fee_centavos if platform_cfg else 15000
    free_threshold = platform_cfg.free_shipping_threshold_centavos if platform_cfg else 300000
    shipping_fee = 0 if subtotal_centavos >= free_threshold else std_shipping
    grand_total = max(0, subtotal_centavos - discount_centavos + shipping_fee)

    payment_method = str(payload.get("paymentMethod") or "gcash").lower()
    if payment_method not in {"gcash", "maya", "paypal"}:
        payment_method = "gcash"

    order = Order(
        order_number=_generate_order_number(),
        user_id=user_id,
        guest_email=resolved_guest_email,
        order_status="PENDING",
        payment_status="PENDING",
        payment_method=payment_method,
        shipping_status="UNFULFILLED",
        subtotal_centavos=subtotal_centavos,
        discount_total_centavos=discount_centavos,
        shipping_fee_centavos=shipping_fee,
        grand_total_centavos=grand_total,
        shipping_full_name=vals["shippingFullName"],
        shipping_phone=vals["shippingPhone"],
        shipping_address_line1=vals["shippingAddressLine1"],
        shipping_address_line2=vals["shippingAddressLine2"],
        shipping_barangay=resolved_barangay,
        shipping_city=resolved_city,
        shipping_province=resolved_province,
        shipping_region=resolved_region,
        shipping_region_code=r_code,
        shipping_province_code=p_code,
        shipping_city_code=c_code,
        shipping_barangay_code=b_code,
        shipping_address_source=addr_source,
        shipping_postal_code=vals["shippingPostalCode"],
        shipping_country="PH",
        estimated_delivery_start=delivery_est.get("estimatedDeliveryStart"),
        estimated_delivery_end=delivery_est.get("estimatedDeliveryEnd"),
        delivery_zone=delivery_est.get("zone"),
        delivery_schedule_source=delivery_est.get("source") or "UNAVAILABLE",
        delivery_holidays_observed=delivery_est.get("holidaysInWindow") or [],
        promotion_id=promotion_id,
        notes=vals["notes"],
        stock_decremented=False,
    )
    db.add(order)
    db.flush()

    # Group items by sellerId -> create SellerOrder records
    seller_subtotals: dict[str, int] = {}
    for oi in order_items_data:
        sid = oi["_sellerId"]
        if sid:
            seller_subtotals[sid] = seller_subtotals.get(sid, 0) + oi["lineTotalCentavos"]

    seller_order_map: dict[str, str] = {}
    for sid, s_sub in seller_subtotals.items():
        so = SellerOrder(order_id=order.id, seller_id=sid, subtotal_centavos=s_sub, status="PENDING")
        db.add(so)
        db.flush()
        seller_order_map[sid] = so.id

    for oi in order_items_data:
        db.add(
            OrderItem(
                order_id=order.id,
                seller_order_id=seller_order_map.get(oi["_sellerId"]) if oi["_sellerId"] else None,
                product_variant_id=oi["productVariantId"],
                product_name=oi["productName"],
                variant_sku=oi["variantSku"],
                size=oi["size"],
                color=oi["color"],
                unit_price_centavos=oi["unitPriceCentavos"],
                quantity=oi["quantity"],
                line_total_centavos=oi["lineTotalCentavos"],
            )
        )

    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete(synchronize_session=False)
    db.commit()

    full_order = _load_full_order(db, order_id=order.id)
    assert full_order is not None
    serialized = serialize_order(full_order, include_seller_orders=True)
    serialized["paymentRequired"] = True

    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "message": "Order created! Complete payment via E-Wallet Sandbox to confirm.",
            "data": serialized,
        },
    )


@router.get("")
def list_my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .options(
            selectinload(Order.items)
            .selectinload(OrderItem.product_variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.images),
            selectinload(Order.payments),
            selectinload(Order.shipments).selectinload(Shipment.delivery_personnel),
            selectinload(Order.seller_orders).selectinload(SellerOrder.seller),
        )
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return {"success": True, "data": [serialize_order(o, include_seller_orders=True) for o in orders]}


@router.get("/{order_number}")
def get_order_by_number(
    order_number: str,
    email: str | None = None,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    order = _load_full_order(db, order_number=order_number)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    user_id = user.id if user else None
    is_staff = bool(user and user.role in {"ADMIN", "CUSTOMER_SUPPORT", "FINANCE_OFFICER", "DELIVERY_PERSONNEL"})
    is_seller_in_order = bool(user and any(so.seller_id == user.id for so in (order.seller_orders or [])))

    if not is_staff and not is_seller_in_order and order.user_id != user_id:
        if not order.guest_email or order.guest_email != email:
            raise HTTPException(status_code=403, detail="Access denied")

    return {"success": True, "data": serialize_order(order, include_seller_orders=True)}


@router.patch("/{order_number}/confirm-receipt")
def confirm_order_receipt(
    order_number: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(Order).options(selectinload(Order.shipments)).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied")

    now = utcnow_naive()
    order.received_confirmed_at = now
    order.order_status = "DELIVERED"
    order.shipping_status = "DELIVERED"

    db.query(SellerOrder).filter(
        SellerOrder.order_id == order.id,
        SellerOrder.status != "CANCELLED",
    ).update({"status": "DELIVERED", "delivered_at": now, "updated_at": now}, synchronize_session=False)

    for s in order.shipments or []:
        prev_events = list(s.history.get("events", [])) if isinstance(s.history, dict) else []
        prev_events.append({
            "status": "DELIVERED",
            "note": "Customer confirmed package receipt",
            "actor": user.email,
            "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        })
        s.status = "DELIVERED"
        s.delivered_at = s.delivered_at or now
        s.recipient_name = s.recipient_name or f"{user.first_name} {user.last_name}"
        s.history = {"events": prev_events}

    db.commit()
    full_order = _load_full_order(db, order_id=order.id)
    assert full_order is not None
    return {
        "success": True,
        "message": "Order receipt confirmed. Thank you for shopping with STRIDERA!",
        "data": serialize_order(full_order),
    }


@router.patch("/{order_number}/cancel")
def cancel_order(
    order_number: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(Order).options(selectinload(Order.items)).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and user.role not in {"ADMIN", "CUSTOMER_SUPPORT"}:
        raise HTTPException(status_code=403, detail="Access denied")
    if order.order_status not in {"PENDING", "CONFIRMED"}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel order in {order.order_status} status")

    if order.stock_decremented:
        for item in order.items:
            if item.fulfillment_status == "CANCELLED" or item.stock_conflict:
                continue
            variant = db.query(ProductVariant).filter(ProductVariant.id == item.product_variant_id).with_for_update().first()
            if variant:
                variant.stock_quantity += item.quantity
                db.add(
                    StockMovement(
                        product_variant_id=variant.id,
                        quantity_change=item.quantity,
                        stock_after=variant.stock_quantity,
                        movement_type="INCOMING",
                        reason="ORDER_CANCELLED",
                        reference_id=order.order_number,
                    )
                )

    db.query(OrderItem).filter(OrderItem.order_id == order.id).update({"fulfillment_status": "CANCELLED"}, synchronize_session=False)
    order.order_status = "CANCELLED"
    if order.payment_status == "PAID":
        order.payment_status = "REFUNDED"
    db.query(SellerOrder).filter(SellerOrder.order_id == order.id).update(
        {"status": "CANCELLED", "notes": "Parent order cancelled"}, synchronize_session=False
    )
    db.commit()

    return {
        "success": True,
        "message": "Order cancelled and stock restored" if order.stock_decremented else "Order cancelled",
    }
