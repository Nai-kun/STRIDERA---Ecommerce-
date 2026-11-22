"""Multi-seller Portal routes (/api/seller/*) with strict tenant isolation."""

from __future__ import annotations

import math
import re
import time
import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import require_seller, utcnow_naive
from ..core.serializers import format_peso, serialize_order_item, serialize_product_image, serialize_shipment, serialize_variant, to_iso_utc
from ..core.validators import (
    ALLOWED_AUDIENCES,
    ALLOWED_SHOE_TYPES,
    collect_field_errors,
    normalize_ph_mobile,
    validate_color,
    validate_entity_name,
    validate_optional_text,
    validate_optional_url,
    validate_price_centavos,
    validate_shoe_size,
    validate_sku,
    validate_stock,
    validation_error_response,
)
from ..models.models import (
    AuditLog,
    Brand,
    Order,
    OrderItem,
    PlatformConfig,
    Product,
    ProductImage,
    ProductVariant,
    SellerOrder,
    SellerPayout,
    Shipment,
    StockMovement,
    User,
)
from ..services.image_upload import MAX_FILES_PER_PRODUCT, save_uploaded_images

router = APIRouter(prefix="/api/seller", tags=["Seller Portal"])

HIGH_LOW_PERCENT = 0.20
LOW_STOCK_THRESHOLD = 5


def _period_start(period: str):
    now = utcnow_naive()
    if period == "7d":
        return now - timedelta(days=7)
    if period == "90d":
        return now - timedelta(days=90)
    if period == "all":
        return None
    return now - timedelta(days=30)


def _slugify(name: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{clean}-{int(time.time() * 1000)}"


def _serialize_seller_product(p: Product, *, full: bool = False) -> dict[str, Any]:
    imgs = sorted(p.images or [], key=lambda im: im.sort_order)
    vars_list = sorted(p.variants or [], key=lambda v: (v.size, v.color))
    data: dict[str, Any] = {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "sku": p.sku,
        "categoryId": p.category_id,
        "sellerId": p.seller_id,
        "brandId": p.brand_id,
        "description": p.description,
        "features": p.features,
        "basePriceCentavos": p.base_price_centavos,
        "basePriceFormatted": format_peso(p.base_price_centavos),
        "compareAtPriceCentavos": p.compare_at_price_centavos,
        "audience": p.audience,
        "shoeType": p.shoe_type,
        "status": p.status,
        "isActive": p.is_active,
        "isFeatured": p.is_featured,
        "createdAt": to_iso_utc(p.created_at),
        "updatedAt": to_iso_utc(p.updated_at),
        "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
        "brand": {"id": p.brand.id, "name": p.brand.name, "slug": p.brand.slug} if p.brand else None,
        "images": [serialize_product_image(im) for im in imgs] if full else [serialize_product_image(im) for im in imgs[:1]],
        "variants": [serialize_variant(v) for v in vars_list] if full else [
            {"id": v.id, "size": v.size, "color": v.color, "stockQuantity": v.stock_quantity, "isActive": v.is_active}
            for v in vars_list
        ],
        "totalStock": sum(v.stock_quantity for v in vars_list),
        "_count": {"variants": len(vars_list)},
    }
    return data


def _serialize_seller_order(so: SellerOrder) -> dict[str, Any]:
    o = so.order
    return {
        "id": so.id,
        "orderId": so.order_id,
        "sellerId": so.seller_id,
        "subtotalCentavos": so.subtotal_centavos,
        "subtotalFormatted": format_peso(so.subtotal_centavos),
        "status": so.status,
        "carrier": so.carrier,
        "trackingNumber": so.tracking_number,
        "trackingUrl": so.tracking_url,
        "acceptedAt": to_iso_utc(so.accepted_at),
        "shippedAt": to_iso_utc(so.shipped_at),
        "deliveredAt": to_iso_utc(so.delivered_at),
        "notes": so.notes,
        "createdAt": to_iso_utc(so.created_at),
        "order": {
            "id": o.id,
            "orderNumber": o.order_number,
            "orderStatus": o.order_status,
            "paymentStatus": o.payment_status,
            "shippingStatus": o.shipping_status,
            "shippingFullName": o.shipping_full_name,
            "shippingPhone": o.shipping_phone,
            "shippingAddressLine1": o.shipping_address_line1,
            "shippingAddressLine2": o.shipping_address_line2,
            "shippingBarangay": o.shipping_barangay,
            "shippingCity": o.shipping_city,
            "shippingProvince": o.shipping_province,
            "shippingPostalCode": o.shipping_postal_code,
            "estimatedDeliveryStart": o.estimated_delivery_start,
            "estimatedDeliveryEnd": o.estimated_delivery_end,
            "createdAt": to_iso_utc(o.created_at),
        } if o else None,
        "items": [serialize_order_item(i) for i in (so.items or [])],
        "shipments": [serialize_shipment(s) for s in (so.shipments or [])],
    }


@router.get("/profile")
def get_seller_profile(user: User = Depends(require_seller), db: Session = Depends(get_db)):
    seller = db.query(User).options(selectinload(User.brand)).filter(User.id == user.id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return {
        "success": True,
        "data": {
            "id": seller.id,
            "email": seller.email,
            "firstName": seller.first_name,
            "lastName": seller.last_name,
            "phone": seller.phone,
            "role": seller.role,
            "sellerStatus": seller.seller_status,
            "storeName": seller.store_name,
            "storeDescription": seller.store_description,
            "storeLogoUrl": seller.store_logo_url,
            "identificationDetails": seller.identification_details,
            "createdAt": to_iso_utc(seller.created_at),
            "brand": {
                "id": seller.brand.id,
                "name": seller.brand.name,
                "slug": seller.brand.slug,
                "description": seller.brand.description,
                "logoUrl": seller.brand.logo_url,
                "isActive": seller.brand.is_active,
            } if seller.brand else None,
        },
    }


@router.put("/profile")
def update_seller_profile(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    collected = collect_field_errors({
        "storeName": validate_entity_name(payload.get("storeName"), "Store name", required=payload.get("storeName") is not None, min_len=2, max_len=80),
        "storeDescription": validate_optional_text(payload.get("storeDescription"), "Store description", max_len=1000),
        "storeLogoUrl": validate_optional_url(payload.get("storeLogoUrl"), "Store logo URL"),
        "identificationDetails": validate_optional_text(payload.get("identificationDetails"), "Identification details", max_len=300),
        "phone": normalize_ph_mobile(payload.get("phone"), required=False),
    })
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    if payload.get("storeName") is not None:
        user.store_name = vals["storeName"]
    if "storeDescription" in payload:
        user.store_description = vals["storeDescription"]
    if "storeLogoUrl" in payload:
        user.store_logo_url = vals["storeLogoUrl"]
    if "identificationDetails" in payload:
        user.identification_details = vals["identificationDetails"]
    if "phone" in payload:
        user.phone = vals["phone"]

    db.commit()
    db.refresh(user)
    return {
        "success": True,
        "data": {
            "id": user.id,
            "email": user.email,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "phone": user.phone,
            "sellerStatus": user.seller_status,
            "storeName": user.store_name,
            "storeDescription": user.store_description,
            "storeLogoUrl": user.store_logo_url,
            "identificationDetails": user.identification_details,
        },
    }


@router.get("/dashboard")
def get_seller_dashboard(user: User = Depends(require_seller), db: Session = Depends(get_db)):
    seller_id = user.id
    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    total_products = db.query(func.count(Product.id)).filter(Product.seller_id == seller_id, Product.is_active == True).scalar() or 0  # noqa: E712
    total_orders = db.query(func.count(SellerOrder.id)).filter(SellerOrder.seller_id == seller_id).scalar() or 0
    shipped_orders = db.query(func.count(SellerOrder.id)).filter(
        SellerOrder.seller_id == seller_id,
        SellerOrder.status.in_(["SHIPPED", "DELIVERED"]),
    ).scalar() or 0
    rev_sum = db.query(func.sum(SellerOrder.subtotal_centavos)).filter(
        SellerOrder.seller_id == seller_id,
        SellerOrder.status.in_(["PAID", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"]),
    ).scalar()
    total_rev_c = int(rev_sum or 0)
    fee_pct = cfg.platform_fee_percent if cfg else 5
    fee_c = (total_rev_c * fee_pct) // 100
    net_c = total_rev_c - fee_c

    low_variants = (
        db.query(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .join(Product, ProductVariant.product_id == Product.id)
        .filter(Product.seller_id == seller_id, Product.is_active == True, ProductVariant.is_active == True, ProductVariant.stock_quantity <= 5)  # noqa: E712
        .order_by(ProductVariant.stock_quantity.asc())
        .limit(10)
        .all()
    )
    recent_orders = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.items))
        .filter(SellerOrder.seller_id == seller_id)
        .order_by(SellerOrder.created_at.desc())
        .limit(5)
        .all()
    )
    payouts = db.query(SellerPayout).filter(SellerPayout.seller_id == seller_id).order_by(SellerPayout.created_at.desc()).limit(5).all()

    return {
        "success": True,
        "data": {
            "sellerProfile": {
                "id": user.id,
                "email": user.email,
                "firstName": user.first_name,
                "lastName": user.last_name,
                "phone": user.phone,
                "storeName": user.store_name,
                "storeDescription": user.store_description,
                "storeLogoUrl": user.store_logo_url,
                "identificationDetails": user.identification_details,
                "sellerStatus": user.seller_status,
            },
            "totalProducts": total_products,
            "totalOrders": total_orders,
            "shippedOrders": shipped_orders,
            "pendingOrders": total_orders - shipped_orders,
            "totalRevenueCentavos": total_rev_c,
            "totalRevenueFormatted": format_peso(total_rev_c),
            "platformFeePercent": fee_pct,
            "platformFeeCentavos": fee_c,
            "platformFeeFormatted": format_peso(fee_c),
            "netEarningsCentavos": net_c,
            "netEarningsFormatted": format_peso(net_c),
            "payouts": [
                {
                    "id": po.id,
                    "payoutNumber": po.payout_number,
                    "netAmountCentavos": po.net_amount_centavos,
                    "netAmountFormatted": format_peso(po.net_amount_centavos),
                    "provider": po.provider,
                    "status": po.status,
                    "createdAt": to_iso_utc(po.created_at),
                }
                for po in payouts
            ],
            "lowStockAlerts": [
                {
                    "variantId": v.id,
                    "productName": v.product.name,
                    "sku": v.product.sku,
                    "variantSku": v.variant_sku,
                    "size": v.size,
                    "color": v.color,
                    "stockQuantity": v.stock_quantity,
                }
                for v in low_variants
            ],
            "recentOrders": [
                {
                    "id": so.id,
                    "orderNumber": so.order.order_number if so.order else "",
                    "status": so.status,
                    "subtotalFormatted": format_peso(so.subtotal_centavos),
                    "itemCount": sum(it.quantity for it in (so.items or [])),
                    "createdAt": to_iso_utc(so.created_at),
                }
                for so in recent_orders
            ],
        },
    }


@router.get("/metrics")
def get_seller_metrics(
    period: str = Query(default="30d"),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    seller_id = user.id
    resolved_period = period if period in {"7d", "30d", "90d", "all"} else "30d"
    period_start = _period_start(resolved_period)

    products = (
        db.query(Product)
        .options(selectinload(Product.images), selectinload(Product.variants))
        .filter(Product.seller_id == seller_id)
        .order_by(Product.created_at.desc())
        .all()
    )

    oi_query = (
        db.query(OrderItem)
        .options(selectinload(OrderItem.product_variant))
        .join(ProductVariant, OrderItem.product_variant_id == ProductVariant.id)
        .join(Product, ProductVariant.product_id == Product.id)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Product.seller_id == seller_id,
            OrderItem.fulfillment_status != "CANCELLED",
            Order.payment_status == "PAID",
            Order.order_status != "CANCELLED",
        )
    )
    if period_start is not None:
        oi_query = oi_query.filter(Order.created_at >= period_start)
    order_items = oi_query.all()

    p_stats: dict[str, dict[str, Any]] = {}
    v_stats: dict[str, dict[str, Any]] = {}

    for p in products:
        imgs = sorted([im for im in (p.images or []) if im.is_primary], key=lambda im: im.sort_order)
        if not imgs and p.images:
            imgs = sorted(p.images, key=lambda im: im.sort_order)
        p_stats[p.id] = {
            "productId": p.id,
            "name": p.name,
            "sku": p.sku,
            "status": p.status or ("ACTIVE" if p.is_active else "ARCHIVED"),
            "isActive": p.is_active,
            "imageUrl": imgs[0].url if imgs else None,
            "unitsSold": 0,
            "revenueCentavos": 0,
            "orderIds": set(),
            "currentStock": sum(v.stock_quantity for v in (p.variants or [])),
            "lowStockCount": sum(1 for v in (p.variants or []) if v.is_active and v.stock_quantity <= LOW_STOCK_THRESHOLD),
        }

    for item in order_items:
        pid = item.product_variant.product_id if item.product_variant else None
        if pid and pid in p_stats:
            ps = p_stats[pid]
            ps["unitsSold"] += item.quantity
            ps["revenueCentavos"] += item.unit_price_centavos * item.quantity
            ps["orderIds"].add(item.order_id)
        vs = v_stats.setdefault(
            item.product_variant_id,
            {
                "variantId": item.product_variant_id,
                "productName": item.product_name,
                "variantSku": item.variant_sku,
                "size": item.size,
                "color": item.color,
                "unitsSold": 0,
                "revenueCentavos": 0,
                "orderIds": set(),
            },
        )
        vs["unitsSold"] += item.quantity
        vs["revenueCentavos"] += item.unit_price_centavos * item.quantity
        vs["orderIds"].add(item.order_id)

    active_list = sorted(
        [p for p in p_stats.values() if p["isActive"] and p["status"] == "ACTIVE"],
        key=lambda x: (-x["unitsSold"], -x["revenueCentavos"]),
    )
    apply_badges = len(active_list) >= 5
    cutoff = max(1, math.ceil(len(active_list) * HIGH_LOW_PERCENT)) if apply_badges else 0
    with_sales = [p for p in active_list if p["unitsSold"] > 0]
    high_ids = {p["productId"] for p in with_sales[:cutoff]} if apply_badges else set()
    low_ids = {p["productId"] for p in with_sales[-cutoff:]} if apply_badges else set()

    ranked = []
    for p in sorted(p_stats.values(), key=lambda x: (-x["unitsSold"], -x["revenueCentavos"])):
        label = None
        if p["unitsSold"] == 0:
            label = "NO_SALES"
        elif apply_badges:
            if p["productId"] in high_ids:
                label = "HIGH_SELLING"
            elif p["productId"] in low_ids:
                label = "LOW_SELLING"
        ranked.append({
            "productId": p["productId"],
            "name": p["name"],
            "sku": p["sku"],
            "status": p["status"],
            "isActive": p["isActive"],
            "imageUrl": p["imageUrl"],
            "unitsSold": p["unitsSold"],
            "revenueCentavos": p["revenueCentavos"],
            "revenueFormatted": format_peso(p["revenueCentavos"]),
            "orderCount": len(p["orderIds"]),
            "currentStock": p["currentStock"],
            "lowStockCount": p["lowStockCount"],
            "performanceLabel": label,
        })

    total_rev = sum(p["revenueCentavos"] for p in ranked)
    total_units = sum(p["unitsSold"] for p in ranked)
    distinct_orders = len({i.order_id for i in order_items})
    total_low = sum(p["lowStockCount"] for p in ranked)

    return {
        "success": True,
        "data": {
            "period": resolved_period,
            "timezone": "Asia/Manila",
            "badgesApplied": apply_badges,
            "lowStockThreshold": LOW_STOCK_THRESHOLD,
            "summary": {
                "revenueCentavos": total_rev,
                "revenueFormatted": format_peso(total_rev),
                "unitsSold": total_units,
                "orderCount": distinct_orders,
                "lowStockCount": total_low,
                "activeProductCount": len(active_list),
            },
            "products": ranked,
            "variants": [
                {
                    "variantId": v["variantId"],
                    "productName": v["productName"],
                    "variantSku": v["variantSku"],
                    "size": v["size"],
                    "color": v["color"],
                    "unitsSold": v["unitsSold"],
                    "revenueCentavos": v["revenueCentavos"],
                    "orderCount": len(v["orderIds"]),
                }
                for v in sorted(v_stats.values(), key=lambda x: -x["unitsSold"])
            ],
        },
    }


@router.get("/products")
def list_seller_products(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    isActive: str | None = None,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Product)
        .options(selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images), selectinload(Product.variants))
        .filter(Product.seller_id == user.id)
    )
    if isActive is not None:
        q = q.filter(Product.is_active == (isActive == "true"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(Product.name.ilike(term), Product.sku.ilike(term)))

    total = q.count()
    items = q.order_by(Product.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "success": True,
        "data": [_serialize_seller_product(p) for p in items],
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/products/{product_id}")
def get_seller_product(product_id: str, user: User = Depends(require_seller), db: Session = Depends(get_db)):
    prod = (
        db.query(Product)
        .options(selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images), selectinload(Product.variants))
        .filter(Product.id == product_id, Product.seller_id == user.id)
        .first()
    )
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True, "data": _serialize_seller_product(prod, full=True)}


@router.post("/products")
def create_seller_product(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    category_id = str(payload.get("categoryId") or "").strip()
    try:
        uuid.UUID(category_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Valid category ID required.") from exc

    collected = collect_field_errors({
        "name": validate_entity_name(payload.get("name"), "Product name", min_len=2, max_len=80),
        "sku": validate_sku(payload.get("sku"), "SKU"),
        "basePriceCentavos": validate_price_centavos(payload.get("basePriceCentavos"), required=True, label="Base price"),
        "compareAtPriceCentavos": validate_price_centavos(payload.get("compareAtPriceCentavos"), required=False, label="Compare at price"),
        "description": validate_optional_text(payload.get("description"), "Description", max_len=2000),
        "features": validate_optional_text(payload.get("features"), "Features", max_len=1000),
    })
    audience = payload.get("audience")
    shoe_type = payload.get("shoeType")
    if audience not in ALLOWED_AUDIENCES:
        collected["fieldErrors"]["audience"] = "Valid audience required."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["audience"]
    if shoe_type not in ALLOWED_SHOE_TYPES:
        collected["fieldErrors"]["shoeType"] = "Valid shoe type required."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["shoeType"]
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    if db.query(Product).filter(Product.sku == vals["sku"]).first():
        raise HTTPException(status_code=400, detail="SKU already exists")

    seller = db.query(User).options(selectinload(User.brand)).filter(User.id == user.id).first()
    product = Product(
        name=vals["name"],
        sku=vals["sku"],
        slug=_slugify(vals["name"]),
        category_id=category_id,
        seller_id=user.id,
        brand_id=seller.brand.id if (seller and seller.brand) else None,
        description=vals["description"] or None,
        features=vals["features"] or None,
        base_price_centavos=vals["basePriceCentavos"],
        compare_at_price_centavos=vals["compareAtPriceCentavos"] or None,
        audience=audience,
        shoe_type=shoe_type,
        is_featured=False,
        is_active=True,
    )
    db.add(product)
    db.flush()
    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_CREATE_PRODUCT",
            entity_type="Product",
            entity_id=product.id,
            new_values={"name": vals["name"], "sku": vals["sku"], "sellerId": user.id},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    full = get_seller_product(product.id, user=user, db=db)
    return JSONResponse(status_code=201, content=full)


@router.put("/products/{product_id}")
def update_seller_product(
    product_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    existing = db.query(Product).filter(Product.id == product_id, Product.seller_id == user.id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    checks: dict[str, dict[str, Any]] = {}
    if "name" in payload:
        checks["name"] = validate_entity_name(payload.get("name"), "Product name", min_len=2, max_len=80)
    if "basePriceCentavos" in payload:
        checks["basePriceCentavos"] = validate_price_centavos(payload.get("basePriceCentavos"), required=True, label="Base price")
    if "compareAtPriceCentavos" in payload:
        checks["compareAtPriceCentavos"] = validate_price_centavos(payload.get("compareAtPriceCentavos"), required=False, label="Compare at price")
    if "description" in payload:
        checks["description"] = validate_optional_text(payload.get("description"), "Description", max_len=2000)
    if "features" in payload:
        checks["features"] = validate_optional_text(payload.get("features"), "Features", max_len=1000)

    collected = collect_field_errors(checks)
    if "audience" in payload and payload["audience"] not in ALLOWED_AUDIENCES:
        collected["fieldErrors"]["audience"] = "Valid audience required."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["audience"]
    if "shoeType" in payload and payload["shoeType"] not in ALLOWED_SHOE_TYPES:
        collected["fieldErrors"]["shoeType"] = "Valid shoe type required."
        collected["ok"] = False
        collected["firstError"] = collected["firstError"] or collected["fieldErrors"]["shoeType"]
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    if vals.get("name"):
        existing.name = vals["name"]
    if payload.get("categoryId"):
        existing.category_id = payload["categoryId"]
    if "description" in vals:
        existing.description = vals["description"]
    if "features" in vals:
        existing.features = vals["features"]
    if "basePriceCentavos" in vals:
        existing.base_price_centavos = vals["basePriceCentavos"]
    if "compareAtPriceCentavos" in vals:
        existing.compare_at_price_centavos = vals["compareAtPriceCentavos"]
    if payload.get("audience"):
        existing.audience = payload["audience"]
    if payload.get("shoeType"):
        existing.shoe_type = payload["shoeType"]

    status_val = payload.get("status")
    is_active_val = payload.get("isActive")
    if status_val in {"ACTIVE", "DRAFT", "ARCHIVED"}:
        existing.status = status_val
        existing.is_active = status_val == "ACTIVE"
    elif is_active_val is not None:
        existing.is_active = bool(is_active_val)
        existing.status = "ACTIVE" if existing.is_active else "ARCHIVED"

    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_UPDATE_PRODUCT",
            entity_type="Product",
            entity_id=existing.id,
            new_values=payload,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return get_seller_product(existing.id, user=user, db=db)


@router.delete("/products/{product_id}")
def archive_seller_product(
    product_id: str,
    request: Request,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    existing = db.query(Product).filter(Product.id == product_id, Product.seller_id == user.id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    existing.is_active = False
    existing.status = "ARCHIVED"
    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_ARCHIVE_PRODUCT",
            entity_type="Product",
            entity_id=existing.id,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {"success": True, "message": "Product archived"}


@router.patch("/products/{product_id}/restore")
def restore_seller_product(
    product_id: str,
    request: Request,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    existing = db.query(Product).filter(Product.id == product_id, Product.seller_id == user.id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    existing.is_active = True
    existing.status = "ACTIVE"
    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_RESTORE_PRODUCT",
            entity_type="Product",
            entity_id=existing.id,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(existing)
    return {"success": True, "message": "Product restored", "data": {"id": existing.id, "isActive": existing.is_active, "status": existing.status}}


@router.post("/products/{product_id}/images")
async def upload_seller_product_image(
    product_id: str,
    image: UploadFile = File(...),
    altText: str | None = Form(default=None),
    isPrimary: str | None = Form(default=None),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .options(selectinload(Product.images))
        .filter(Product.id == product_id, Product.seller_id == user.id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if len(product.images or []) >= MAX_FILES_PER_PRODUCT:
        raise HTTPException(status_code=400, detail=f"Maximum of {MAX_FILES_PER_PRODUCT} images per product allowed")

    saved = await save_uploaded_images([image])
    url = saved[0]["url"]
    make_primary = len(product.images or []) == 0 or isPrimary == "true"
    if make_primary:
        db.query(ProductImage).filter(ProductImage.product_id == product.id).update({"is_primary": False}, synchronize_session=False)

    img = ProductImage(
        product_id=product.id,
        url=url,
        alt_text=altText or product.name,
        sort_order=len(product.images or []),
        is_primary=make_primary,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return JSONResponse(status_code=201, content={"success": True, "data": serialize_product_image(img)})


@router.delete("/products/{product_id}/images/{image_id}")
def delete_seller_product_image(
    product_id: str,
    image_id: str,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id, Product.seller_id == user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    img = db.query(ProductImage).filter(ProductImage.id == image_id, ProductImage.product_id == product.id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    db.delete(img)
    db.commit()
    return {"success": True, "message": "Image removed"}


@router.post("/products/{product_id}/variants")
def add_seller_variant(
    product_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id, Product.seller_id == user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    collected = collect_field_errors({
        "variantSku": validate_sku(payload.get("variantSku"), "Variant SKU"),
        "size": validate_shoe_size(payload.get("size")),
        "color": validate_color(payload.get("color")),
        "stockQuantity": validate_stock(payload.get("stockQuantity")),
        "priceOverrideCentavos": validate_price_centavos(payload.get("priceOverrideCentavos"), required=False, label="Price override"),
    })
    if not collected["ok"]:
        return validation_error_response(collected)

    vals = collected["values"]
    if db.query(ProductVariant).filter(ProductVariant.variant_sku == vals["variantSku"]).first():
        raise HTTPException(status_code=400, detail="Variant SKU already exists")

    variant = ProductVariant(
        product_id=product.id,
        variant_sku=vals["variantSku"],
        size=vals["size"],
        color=vals["color"],
        color_hex=payload.get("colorHex") or None,
        price_override_centavos=vals["priceOverrideCentavos"] or None,
        stock_quantity=vals["stockQuantity"],
    )
    db.add(variant)
    db.flush()
    if vals["stockQuantity"] > 0:
        db.add(
            StockMovement(
                product_variant_id=variant.id,
                quantity_change=vals["stockQuantity"],
                stock_after=vals["stockQuantity"],
                movement_type="INCOMING",
                reason="SELLER_INITIAL_STOCK",
                reference_id=user.id,
            )
        )
    db.commit()
    db.refresh(variant)
    return JSONResponse(status_code=201, content={"success": True, "data": serialize_variant(variant)})


@router.patch("/variants/{variant_id}/stock")
def adjust_seller_variant_stock(
    variant_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    try:
        qty_change = int(payload.get("quantityChange"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="quantityChange integer required") from exc
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason required")

    variant = (
        db.query(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .filter(ProductVariant.id == variant_id)
        .first()
    )
    if not variant or not variant.product or variant.product.seller_id != user.id:
        raise HTTPException(status_code=404, detail="Variant not found")

    old_stock = variant.stock_quantity
    new_stock = old_stock + qty_change
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock for adjustment")

    variant.stock_quantity = new_stock
    db.add(
        StockMovement(
            product_variant_id=variant.id,
            quantity_change=qty_change,
            stock_after=new_stock,
            movement_type="INCOMING" if qty_change > 0 else "OUTGOING",
            reason=f"SELLER_{reason.upper().replace(' ', '_')}",
            reference_id=user.id,
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_ADJUST_STOCK",
            entity_type="ProductVariant",
            entity_id=variant.id,
            old_values={"stockQuantity": old_stock},
            new_values={"stockQuantity": new_stock, "quantityChange": qty_change, "reason": reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {
        "success": True,
        "data": {
            "variantId": variant.id,
            "variantSku": variant.variant_sku,
            "stockBefore": old_stock,
            "stockAfter": new_stock,
            "quantityChange": qty_change,
        },
    }


@router.get("/orders")
def list_seller_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    q = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.items), selectinload(SellerOrder.shipments))
        .filter(SellerOrder.seller_id == user.id)
    )
    if status:
        q = q.filter(SellerOrder.status == status)
    total = q.count()
    items = q.order_by(SellerOrder.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "success": True,
        "data": [_serialize_seller_order(so) for so in items],
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/orders/{order_id}")
def get_seller_order(order_id: str, user: User = Depends(require_seller), db: Session = Depends(get_db)):
    so = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.items), selectinload(SellerOrder.shipments))
        .filter(SellerOrder.id == order_id, SellerOrder.seller_id == user.id)
        .first()
    )
    if not so:
        raise HTTPException(status_code=404, detail="Seller order slice not found")
    return {"success": True, "data": _serialize_seller_order(so)}


@router.patch("/orders/{order_id}/accept")
def accept_seller_order(
    order_id: str,
    request: Request,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    so = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.shipments))
        .filter(SellerOrder.id == order_id, SellerOrder.seller_id == user.id)
        .first()
    )
    if not so:
        raise HTTPException(status_code=404, detail="Seller order slice not found")
    if so.status not in {"PENDING", "PAID"}:
        raise HTTPException(status_code=400, detail=f"Order slice is already in {so.status} status")

    now = utcnow_naive()
    default_driver = db.query(User).filter(User.role == "DELIVERY_PERSONNEL", User.is_active == True).first()  # noqa: E712
    so.status = "PREPARING"
    so.accepted_at = now
    if so.order:
        so.order.shipping_status = "PREPARING"
        so.order.order_status = "PROCESSING"

    if not so.shipments:
        db.add(
            Shipment(
                order_id=so.order_id,
                seller_order_id=so.id,
                delivery_personnel_id=default_driver.id if default_driver else None,
                carrier="STRIDERA Express Courier",
                status="PREPARING",
                notes=f"Order accepted by {user.store_name or 'Seller'}, preparing package for collection.",
                history={
                    "events": [
                        {
                            "status": "PREPARING",
                            "note": f"Order accepted by {user.store_name or user.email} and queued for packing",
                            "actor": user.email,
                            "timestamp": now.isoformat() + "Z",
                        }
                    ]
                },
            )
        )

    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_ACCEPT_ORDER_SLICE",
            entity_type="SellerOrder",
            entity_id=so.id,
            new_values={"status": "PREPARING", "acceptedAt": now.isoformat()},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(so)
    return {
        "success": True,
        "message": "Order accepted and marked as PREPARING for shipment.",
        "data": _serialize_seller_order(so),
    }


@router.patch("/orders/{order_id}/fulfill")
def fulfill_seller_order(
    order_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    carrier = str(payload.get("carrier") or "").strip()
    tracking_number = str(payload.get("trackingNumber") or "").strip()
    if len(carrier) < 2 or len(tracking_number) < 3:
        raise HTTPException(status_code=400, detail="Carrier (min 2 chars) and trackingNumber (min 3 chars) required")

    so = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.shipments))
        .filter(SellerOrder.id == order_id, SellerOrder.seller_id == user.id)
        .first()
    )
    if not so:
        raise HTTPException(status_code=404, detail="Seller order slice not found")
    if so.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot fulfill cancelled order slice")

    now = utcnow_naive()
    tracking_url = str(payload.get("trackingUrl") or "").strip() or None
    notes = str(payload.get("notes") or "").strip() or None
    default_driver = db.query(User).filter(User.role == "DELIVERY_PERSONNEL", User.is_active == True).first()  # noqa: E712

    so.status = "SHIPPED"
    so.carrier = carrier
    so.tracking_number = tracking_number
    so.tracking_url = tracking_url
    so.notes = notes
    so.accepted_at = so.accepted_at or now
    so.shipped_at = now

    db.query(OrderItem).filter(
        OrderItem.seller_order_id == so.id,
        OrderItem.fulfillment_status != "CANCELLED",
    ).update({"fulfillment_status": "SHIPPED", "shipped_at": now}, synchronize_session=False)

    evt = {
        "status": "SHIPPED",
        "note": f"Dispatched by {user.store_name or 'Seller'} via {carrier} (Tracking: {tracking_number})",
        "actor": user.email,
        "timestamp": now.isoformat() + "Z",
    }
    if so.shipments:
        sh = so.shipments[0]
        prev = list(sh.history.get("events", [])) if isinstance(sh.history, dict) else []
        sh.carrier = carrier
        sh.tracking_number = tracking_number
        sh.tracking_url = tracking_url
        sh.status = "SHIPPED"
        sh.shipped_at = now
        sh.notes = notes or sh.notes
        sh.history = {"events": prev + [evt]}
    else:
        db.add(
            Shipment(
                order_id=so.order_id,
                seller_order_id=so.id,
                delivery_personnel_id=default_driver.id if default_driver else None,
                carrier=carrier,
                tracking_number=tracking_number,
                tracking_url=tracking_url,
                status="SHIPPED",
                shipped_at=now,
                notes=notes or f"Dispatched by {user.store_name or 'Seller'}",
                history={"events": [evt]},
            )
        )

    siblings = db.query(SellerOrder).filter(SellerOrder.order_id == so.order_id).all()
    all_shipped = all(s.status in {"SHIPPED", "DELIVERED"} for s in siblings)
    if so.order:
        so.order.shipping_status = "SHIPPED" if all_shipped else "PREPARING"
        if all_shipped:
            so.order.order_status = "SHIPPED"

    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_FULFILL_SLICE",
            entity_type="SellerOrder",
            entity_id=so.id,
            new_values={"carrier": carrier, "trackingNumber": tracking_number, "status": "SHIPPED"},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {"success": True, "message": "Fulfillment recorded", "data": _serialize_seller_order(so)}


@router.patch("/orders/{order_id}/cancel")
def cancel_seller_order(
    order_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
):
    so = (
        db.query(SellerOrder)
        .options(selectinload(SellerOrder.order), selectinload(SellerOrder.items))
        .filter(SellerOrder.id == order_id, SellerOrder.seller_id == user.id)
        .first()
    )
    if not so:
        raise HTTPException(status_code=404, detail="Seller order slice not found")
    if so.status in {"SHIPPED", "DELIVERED", "CANCELLED"}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel slice in {so.status} status")

    reason = str(payload.get("reason") or "Seller cancelled order slice").strip()
    so.status = "CANCELLED"
    so.notes = reason

    db.query(OrderItem).filter(OrderItem.seller_order_id == so.id).update({"fulfillment_status": "CANCELLED"}, synchronize_session=False)

    if so.order and so.order.stock_decremented:
        for item in so.items:
            if item.stock_conflict:
                continue
            v = db.query(ProductVariant).filter(ProductVariant.id == item.product_variant_id).with_for_update().first()
            if v:
                v.stock_quantity += item.quantity
                db.add(
                    StockMovement(
                        product_variant_id=v.id,
                        quantity_change=item.quantity,
                        stock_after=v.stock_quantity,
                        movement_type="INCOMING",
                        reason=f"SELLER_CANCEL_RESTORE: {reason.upper().replace(' ', '_')}",
                        reference_id=user.id,
                    )
                )

    db.add(
        AuditLog(
            user_id=user.id,
            action="SELLER_CANCEL_ORDER_SLICE",
            entity_type="SellerOrder",
            entity_id=so.id,
            new_values={"reason": reason, "restoredItems": len(so.items or [])},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {"success": True, "message": "Order slice cancelled and inventory restored"}
