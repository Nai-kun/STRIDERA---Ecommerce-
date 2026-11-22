"""Administrator Portal routes (/api/admin/*) across users, catalog, analytics, settings & system health."""

from __future__ import annotations

import math
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.database import get_db, ping_database
from ..core.security import (
    decrypt_setting,
    encrypt_setting,
    mask_secret,
    require_admin,
    utcnow_naive,
)
from ..core.serializers import format_peso, serialize_product_image, serialize_variant, to_iso_utc
from ..core.validators import (
    ALLOWED_AUDIENCES,
    ALLOWED_SHOE_TYPES,
    collect_field_errors,
    validate_color,
    validate_entity_name,
    validate_optional_text,
    validate_price_centavos,
    validate_required_text,
    validate_shoe_size,
    validate_sku,
    validate_stock,
    validation_error_response,
)
from ..models.models import (
    AuditLog,
    Brand,
    Category,
    Order,
    OrderItem,
    Payment,
    PlatformConfig,
    Product,
    ProductVariant,
    Promotion,
    SellerOrder,
    StockMovement,
    SystemSetting,
    User,
    WebhookEvent,
)
from ..services import holiday_client, psgc_client

router = APIRouter(prefix="/api/admin", tags=["Administrator"])

VALID_ROLES = {
    "CUSTOMER",
    "SELLER",
    "ADMIN",
    "INVENTORY_MANAGER",
    "DELIVERY_PERSONNEL",
    "CUSTOMER_SUPPORT",
    "FINANCE_OFFICER",
}


def _slugify(name: str, with_ts: bool = True) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{clean}-{int(time.time() * 1000)}" if with_ts else clean


def _parse_iso_dt(val: Any) -> datetime | None:
    if not val:
        return None
    try:
        s = str(val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.replace(tzinfo=None)
    except ValueError:
        return None


@router.get("/products")
def admin_list_products(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    categoryId: str | None = None,
    isActive: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Product).options(
        selectinload(Product.category),
        selectinload(Product.images),
        selectinload(Product.variants),
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    if categoryId:
        q = q.filter(Product.category_id == categoryId)
    if isActive is not None:
        q = q.filter(Product.is_active == (isActive == "true"))

    total = q.count()
    items = q.order_by(Product.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    data = []
    for p in items:
        imgs = sorted([im for im in (p.images or []) if im.is_primary], key=lambda x: x.sort_order)
        if not imgs and p.images:
            imgs = sorted(p.images, key=lambda x: x.sort_order)[:1]
        data.append({
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "sku": p.sku,
            "categoryId": p.category_id,
            "sellerId": p.seller_id,
            "basePriceCentavos": p.base_price_centavos,
            "compareAtPriceCentavos": p.compare_at_price_centavos,
            "audience": p.audience,
            "shoeType": p.shoe_type,
            "status": p.status,
            "isActive": p.is_active,
            "isFeatured": p.is_featured,
            "createdAt": to_iso_utc(p.created_at),
            "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
            "images": [serialize_product_image(im) for im in imgs],
            "variants": [
                {"id": v.id, "size": v.size, "color": v.color, "stockQuantity": v.stock_quantity, "isActive": v.is_active}
                for v in (p.variants or [])
            ],
            "_count": {"variants": len(p.variants or [])},
        })

    return {
        "success": True,
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/products/{product_id}")
def admin_get_product(product_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = (
        db.query(Product)
        .options(selectinload(Product.category), selectinload(Product.images), selectinload(Product.variants))
        .filter(Product.id == product_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "success": True,
        "data": {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "sku": p.sku,
            "categoryId": p.category_id,
            "description": p.description,
            "features": p.features,
            "basePriceCentavos": p.base_price_centavos,
            "compareAtPriceCentavos": p.compare_at_price_centavos,
            "audience": p.audience,
            "shoeType": p.shoe_type,
            "status": p.status,
            "isActive": p.is_active,
            "isFeatured": p.is_featured,
            "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
            "images": [serialize_product_image(im) for im in sorted(p.images or [], key=lambda x: x.sort_order)],
            "variants": [serialize_variant(v) for v in sorted(p.variants or [], key=lambda x: (x.size, x.color))],
        },
    }


@router.post("/products")
def admin_create_product(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    category_id = str(payload.get("categoryId") or "").strip()
    if not category_id:
        raise HTTPException(status_code=400, detail="Valid category ID required")

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
        collected["fieldErrors"]["audience"] = "Valid audience required (MEN, WOMEN, UNISEX)."
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

    prod = Product(
        name=vals["name"],
        sku=vals["sku"],
        slug=_slugify(vals["name"], with_ts=True),
        category_id=category_id,
        description=vals["description"],
        features=vals["features"],
        base_price_centavos=vals["basePriceCentavos"],
        compare_at_price_centavos=vals["compareAtPriceCentavos"] or None,
        audience=audience,
        shoe_type=shoe_type,
        is_featured=bool(payload.get("isFeatured")),
    )
    db.add(prod)
    db.flush()
    db.add(
        AuditLog(
            user_id=user.id,
            action="CREATE_PRODUCT",
            entity_type="Product",
            entity_id=prod.id,
            new_values={"name": vals["name"], "sku": vals["sku"]},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    res = admin_get_product(prod.id, user=user, db=db)
    return JSONResponse(status_code=201, content=res)


@router.put("/products/{product_id}")
def admin_update_product(
    product_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
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

    old_values = {"name": product.name, "basePriceCentavos": product.base_price_centavos, "isActive": product.is_active}
    vals = collected["values"]
    if vals.get("name"):
        product.name = vals["name"]
    if payload.get("categoryId"):
        product.category_id = payload["categoryId"]
    if "description" in vals:
        product.description = vals["description"]
    if "features" in vals:
        product.features = vals["features"]
    if "basePriceCentavos" in vals:
        product.base_price_centavos = vals["basePriceCentavos"]
    if "compareAtPriceCentavos" in vals:
        product.compare_at_price_centavos = vals["compareAtPriceCentavos"]
    if payload.get("audience"):
        product.audience = payload["audience"]
    if payload.get("shoeType"):
        product.shoe_type = payload["shoeType"]
    if "isFeatured" in payload:
        product.is_featured = bool(payload["isFeatured"])
    if "isActive" in payload:
        product.is_active = bool(payload["isActive"])

    db.add(
        AuditLog(
            user_id=user.id,
            action="UPDATE_PRODUCT",
            entity_type="Product",
            entity_id=product.id,
            old_values=old_values,
            new_values=payload,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return admin_get_product(product.id, user=user, db=db)


@router.delete("/products/{product_id}")
def admin_delete_product(
    product_id: str,
    request: Request,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    db.add(
        AuditLog(
            user_id=user.id,
            action="DEACTIVATE_PRODUCT",
            entity_type="Product",
            entity_id=product.id,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {"success": True, "message": "Product deactivated"}


@router.post("/products/{product_id}/variants")
def admin_add_variant(
    product_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
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
    variant = ProductVariant(
        product_id=product_id,
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
                reason="INITIAL_STOCK",
            )
        )
    db.commit()
    db.refresh(variant)
    return JSONResponse(status_code=201, content={"success": True, "data": serialize_variant(variant)})


@router.patch("/variants/{variant_id}/stock")
def admin_adjust_stock(
    variant_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        qty_change = int(payload.get("quantityChange"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="quantityChange integer required") from exc
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason required")

    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
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
            reason=reason.upper().replace(" ", "_"),
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="ADJUST_STOCK",
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
        "data": {"variantId": variant.id, "stockBefore": old_stock, "stockAfter": new_stock, "quantityChange": qty_change},
    }


@router.post("/categories")
def admin_create_category(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = str(payload.get("name") or "").strip()
    slug = str(payload.get("slug") or "").strip()
    if not name or not slug:
        raise HTTPException(status_code=400, detail="Category name and slug required")
    cat = Category(
        name=name,
        slug=slug,
        description=payload.get("description"),
        image_url=payload.get("imageUrl"),
        sort_order=int(payload.get("sortOrder") or 0),
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "data": {"id": cat.id, "name": cat.name, "slug": cat.slug, "description": cat.description, "imageUrl": cat.image_url, "sortOrder": cat.sort_order, "isActive": cat.is_active},
        },
    )


@router.put("/categories/{category_id}")
def admin_update_category(
    category_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.get("name"):
        cat.name = str(payload["name"]).strip()
    if payload.get("slug"):
        cat.slug = str(payload["slug"]).strip()
    if "description" in payload:
        cat.description = payload["description"]
    if "imageUrl" in payload:
        cat.image_url = payload["imageUrl"]
    if "sortOrder" in payload:
        cat.sort_order = int(payload["sortOrder"])
    if "isActive" in payload:
        cat.is_active = bool(payload["isActive"])
    db.commit()
    db.refresh(cat)
    return {
        "success": True,
        "data": {"id": cat.id, "name": cat.name, "slug": cat.slug, "description": cat.description, "imageUrl": cat.image_url, "sortOrder": cat.sort_order, "isActive": cat.is_active},
    }


@router.get("/orders")
def admin_list_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    orderStatus: str | None = None,
    paymentStatus: str | None = None,
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Order).options(selectinload(Order.items), selectinload(Order.payments), selectinload(Order.user))
    if orderStatus:
        q = q.filter(Order.order_status == orderStatus)
    if paymentStatus:
        q = q.filter(Order.payment_status == paymentStatus)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(Order.order_number.ilike(term), Order.guest_email.ilike(term)))

    total = q.count()
    items = q.order_by(Order.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    data = []
    for o in items:
        data.append({
            "id": o.id,
            "orderNumber": o.order_number,
            "orderStatus": o.order_status,
            "paymentStatus": o.payment_status,
            "shippingStatus": o.shipping_status,
            "grandTotalCentavos": o.grand_total_centavos,
            "grandTotalFormatted": format_peso(o.grand_total_centavos),
            "guestEmail": o.guest_email,
            "createdAt": to_iso_utc(o.created_at),
            "items": [{"id": i.id, "productName": i.product_name, "quantity": i.quantity, "lineTotalCentavos": i.line_total_centavos} for i in (o.items or [])],
            "payments": [{"id": p.id, "status": p.status, "provider": p.provider, "isDemo": p.is_demo, "verifiedAt": to_iso_utc(p.verified_at)} for p in (o.payments or [])],
            "user": {"id": o.user.id, "email": o.user.email, "firstName": o.user.first_name, "lastName": o.user.last_name} if o.user else None,
        })

    return {
        "success": True,
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.patch("/orders/{order_number}/status")
def admin_update_order_status(
    order_number: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_status = payload.get("orderStatus")
    shipping_status = payload.get("shippingStatus")
    if order_status and order_status not in {"PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"}:
        raise HTTPException(status_code=400, detail="Invalid orderStatus")
    if shipping_status and shipping_status not in {"UNFULFILLED", "PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED"}:
        raise HTTPException(status_code=400, detail="Invalid shippingStatus")

    old_values = {"orderStatus": order.order_status, "shippingStatus": order.shipping_status}
    if order_status:
        order.order_status = order_status
    if shipping_status:
        order.shipping_status = shipping_status

    db.add(
        AuditLog(
            user_id=user.id,
            action="UPDATE_ORDER_STATUS",
            entity_type="Order",
            entity_id=order.id,
            old_values=old_values,
            new_values={"orderStatus": order_status, "shippingStatus": shipping_status},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(order)
    return {
        "success": True,
        "data": {"id": order.id, "orderNumber": order.order_number, "orderStatus": order.order_status, "shippingStatus": order.shipping_status},
    }


@router.get("/promotions")
def admin_list_promotions(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    promos = db.query(Promotion).order_by(Promotion.created_at.desc()).all()
    return {
        "success": True,
        "data": [
            {
                "id": p.id,
                "code": p.code,
                "description": p.description,
                "discountType": p.discount_type,
                "discountValue": p.discount_value,
                "minOrderCentavos": p.min_order_centavos,
                "maxDiscountCentavos": p.max_discount_centavos,
                "usageLimit": p.usage_limit,
                "timesUsed": p.times_used,
                "startsAt": to_iso_utc(p.starts_at),
                "expiresAt": to_iso_utc(p.expires_at),
                "isActive": p.is_active,
            }
            for p in promos
        ],
    }


@router.post("/promotions")
def admin_create_promotion(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    code = str(payload.get("code") or "").strip().upper()
    dtype = str(payload.get("discountType") or "").upper()
    try:
        dval = int(payload.get("discountValue"))
    except (TypeError, ValueError):
        dval = 0
    if not code or dtype not in {"FLAT", "PERCENTAGE"} or dval < 1:
        raise HTTPException(status_code=400, detail="Valid code, discountType, and discountValue required")

    promo = Promotion(
        code=code,
        description=payload.get("description"),
        discount_type=dtype,
        discount_value=dval,
        min_order_centavos=payload.get("minOrderCentavos") or None,
        max_discount_centavos=payload.get("maxDiscountCentavos") or None,
        usage_limit=payload.get("usageLimit") or None,
        starts_at=_parse_iso_dt(payload.get("startsAt")),
        expires_at=_parse_iso_dt(payload.get("expiresAt")),
    )
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return JSONResponse(status_code=201, content={"success": True, "data": {"id": promo.id, "code": promo.code, "isActive": promo.is_active}})


@router.patch("/promotions/{promo_id}")
def admin_toggle_promotion(
    promo_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    promo = db.query(Promotion).filter(Promotion.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found")
    if "isActive" in payload:
        promo.is_active = bool(payload["isActive"])
    db.commit()
    db.refresh(promo)
    return {"success": True, "data": {"id": promo.id, "code": promo.code, "isActive": promo.is_active}}


@router.get("/customers")
def admin_list_customers(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.role == "CUSTOMER")
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term)))
    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    data = []
    for c in users:
        o_count = db.query(func.count(Order.id)).filter(Order.user_id == c.id).scalar() or 0
        data.append({
            "id": c.id,
            "email": c.email,
            "firstName": c.first_name,
            "lastName": c.last_name,
            "phone": c.phone,
            "isActive": c.is_active,
            "createdAt": to_iso_utc(c.created_at),
            "_count": {"orders": o_count},
        })

    return {
        "success": True,
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/reports/sales")
def admin_sales_report(
    days: int = Query(default=30, ge=1),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    since = utcnow_naive() - timedelta(days=days)
    total_orders = db.query(func.count(Order.id)).filter(Order.created_at >= since).scalar() or 0
    paid_orders = db.query(func.count(Order.id)).filter(Order.created_at >= since, Order.payment_status == "PAID").scalar() or 0
    rev_sum = db.query(func.sum(Order.grand_total_centavos)).filter(Order.created_at >= since, Order.payment_status == "PAID").scalar()
    rev_c = int(rev_sum or 0)

    low_variants = (
        db.query(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .filter(ProductVariant.stock_quantity <= 5, ProductVariant.is_active == True)  # noqa: E712
        .order_by(ProductVariant.stock_quantity.asc())
        .limit(10)
        .all()
    )
    top_rows = (
        db.query(
            OrderItem.product_name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.line_total_centavos).label("rev"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.created_at >= since, Order.payment_status == "PAID")
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.line_total_centavos).desc())
        .limit(5)
        .all()
    )

    conv_rate = f"{((paid_orders / total_orders) * 100):.1f}" if total_orders > 0 else "0"
    aov_c = round(rev_c / paid_orders) if paid_orders > 0 else 0
    return {
        "success": True,
        "data": {
            "periodDays": days,
            "totalOrders": total_orders,
            "paidOrders": paid_orders,
            "conversionRate": conv_rate,
            "totalRevenueCentavos": rev_c,
            "totalRevenueFormatted": format_peso(rev_c),
            "averageOrderValueCentavos": aov_c,
            "averageOrderValueFormatted": format_peso(aov_c),
            "lowStockAlerts": [
                {
                    "variantId": v.id,
                    "productName": v.product.name if v.product else "",
                    "sku": v.product.sku if v.product else "",
                    "variantSku": v.variant_sku,
                    "size": v.size,
                    "color": v.color,
                    "stockQuantity": v.stock_quantity,
                }
                for v in low_variants
            ],
            "topProducts": [
                {"productName": r[0], "_sum": {"quantity": int(r[1] or 0), "lineTotalCentavos": int(r[2] or 0)}}
                for r in top_rows
            ],
        },
    }


@router.get("/audit-logs")
def admin_audit_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total = db.query(func.count(AuditLog.id)).scalar() or 0
    logs = (
        db.query(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "id": log.id,
                "userId": log.user_id,
                "action": log.action,
                "entityType": log.entity_type,
                "entityId": log.entity_id,
                "oldValues": log.old_values,
                "newValues": log.new_values,
                "ipAddress": log.ip_address,
                "createdAt": to_iso_utc(log.created_at),
                "user": {"id": log.user.id, "email": log.user.email, "role": log.user.role} if log.user else None,
            }
            for log in logs
        ],
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/sellers")
def admin_list_sellers(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    sellerStatus: str | None = None,
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User).options(selectinload(User.brand)).filter(User.role == "SELLER")
    if sellerStatus:
        q = q.filter(User.seller_status == sellerStatus)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(User.store_name.ilike(term), User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term)))

    total = q.count()
    sellers = q.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    data = []
    for s in sellers:
        p_cnt = db.query(func.count(Product.id)).filter(Product.seller_id == s.id).scalar() or 0
        so_cnt = db.query(func.count(SellerOrder.id)).filter(SellerOrder.seller_id == s.id).scalar() or 0
        data.append({
            "id": s.id,
            "email": s.email,
            "firstName": s.first_name,
            "lastName": s.last_name,
            "phone": s.phone,
            "role": s.role,
            "isActive": s.is_active,
            "accountStatus": s.account_status,
            "sellerStatus": s.seller_status,
            "storeName": s.store_name,
            "storeDescription": s.store_description,
            "storeLogoUrl": s.store_logo_url,
            "identificationDetails": s.identification_details,
            "createdAt": to_iso_utc(s.created_at),
            "brand": {"id": s.brand.id, "name": s.brand.name, "slug": s.brand.slug} if s.brand else None,
            "_count": {"products": p_cnt, "sellerOrders": so_cnt},
        })

    return {
        "success": True,
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.patch("/sellers/{seller_id}/status")
def admin_update_seller_status(
    seller_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    next_status = str(payload.get("sellerStatus") or "").upper()
    if next_status not in {"PENDING", "APPROVED", "REJECTED", "SUSPENDED"}:
        raise HTTPException(status_code=400, detail="Valid seller status required")

    seller = db.query(User).filter(User.id == seller_id, User.role == "SELLER").first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller account not found")

    old_status = seller.seller_status
    seller.seller_status = next_status
    db.add(
        AuditLog(
            user_id=user.id,
            action="UPDATE_SELLER_STATUS",
            entity_type="User",
            entity_id=seller.id,
            old_values={"sellerStatus": old_status},
            new_values={"sellerStatus": next_status},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {
        "success": True,
        "message": f"Seller status updated to {next_status}",
        "data": {"id": seller.id, "email": seller.email, "sellerStatus": seller.seller_status},
    }


@router.post("/sellers/{seller_id}/assign-brand")
def admin_assign_brand(
    seller_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    brand_id = str(payload.get("brandId") or "").strip()
    if not brand_id:
        raise HTTPException(status_code=400, detail="Valid brandId required")
    seller = db.query(User).filter(User.id == seller_id, User.role == "SELLER").first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.seller_id = seller.id
    db.add(
        AuditLog(
            user_id=user.id,
            action="ASSIGN_BRAND_TO_SELLER",
            entity_type="Brand",
            entity_id=brand.id,
            new_values={"sellerId": seller.id, "brandName": brand.name},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(brand)
    return {
        "success": True,
        "message": f'Brand "{brand.name}" assigned to seller',
        "data": {"id": brand.id, "name": brand.name, "slug": brand.slug, "sellerId": brand.seller_id},
    }


@router.get("/brands")
def admin_list_brands(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    brands = db.query(Brand).options(selectinload(Brand.seller)).order_by(Brand.created_at.desc()).all()
    data = []
    for b in brands:
        p_cnt = db.query(func.count(Product.id)).filter(Product.brand_id == b.id).scalar() or 0
        data.append({
            "id": b.id,
            "name": b.name,
            "slug": b.slug,
            "description": b.description,
            "logoUrl": b.logo_url,
            "sellerId": b.seller_id,
            "isActive": b.is_active,
            "createdAt": to_iso_utc(b.created_at),
            "seller": {"id": b.seller.id, "email": b.seller.email, "storeName": b.seller.store_name, "sellerStatus": b.seller.seller_status} if b.seller else None,
            "_count": {"products": p_cnt},
        })
    return {"success": True, "data": data}


@router.post("/brands")
def admin_create_brand(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = str(payload.get("name") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Brand name is required")
    slug = _slugify(name, with_ts=False)
    if db.query(Brand).filter(Brand.slug == slug).first():
        raise HTTPException(status_code=400, detail="Brand with this name already exists")

    brand = Brand(
        name=name,
        slug=slug,
        description=payload.get("description") or None,
        logo_url=payload.get("logoUrl") or None,
        seller_id=payload.get("sellerId") or None,
        is_active=True,
    )
    db.add(brand)
    db.flush()
    db.add(
        AuditLog(
            user_id=user.id,
            action="CREATE_BRAND",
            entity_type="Brand",
            entity_id=brand.id,
            new_values={"name": name, "sellerId": brand.seller_id},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(brand)
    return JSONResponse(
        status_code=201,
        content={"success": True, "data": {"id": brand.id, "name": brand.name, "slug": brand.slug, "sellerId": brand.seller_id}},
    )


@router.get("/config-status")
def admin_config_status(user: User = Depends(require_admin)):
    settings = get_settings()
    masked_db = "NOT CONFIGURED"
    if settings.database_url:
        try:
            u = urlparse(settings.database_url)
            masked_db = f"{u.scheme}://{u.username or 'postgres'}:****@{u.hostname}:{u.port}{u.path}"
        except Exception:
            masked_db = "CONFIGURED"

    fee = int(os.getenv("DEFAULT_SHIPPING_FEE_CENTAVOS", "15000") or 15000)
    return {
        "success": True,
        "data": {
            "environment": settings.node_env,
            "runtime": "Python FastAPI + SQLAlchemy 2.0",
            "port": settings.port,
            "frontendUrl": settings.frontend_url,
            "database": {"configured": bool(settings.database_url), "connection": masked_db},
            "externalApis": {
                "psgcAddressApi": "https://psgc.gitlab.io/api",
                "holidayCalendarApi": "https://date.nager.at/api/v3",
            },
            "demoSafetyFallback": {
                "enabled": settings.demo_mode,
                "mode": "ACTIVE (Simulate Payment Available for Admin)" if settings.demo_mode else "DISABLED",
            },
            "shipping": {"defaultFeeCentavos": fee, "defaultFeeFormatted": format_peso(fee)},
            "systemStatus": "READY (Python FastAPI + Free PH APIs)",
        },
    }


@router.get("/payment-logs")
def admin_payment_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total = db.query(func.count(Payment.id)).scalar() or 0
    payments = (
        db.query(Payment)
        .options(selectinload(Payment.order).selectinload(Order.user))
        .order_by(Payment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    data = []
    for p in payments:
        data.append({
            "id": p.id,
            "orderId": p.order_id,
            "provider": p.provider,
            "paymentMethod": p.payment_method,
            "status": p.status,
            "amountCentavos": p.amount_centavos,
            "amountFormatted": format_peso(p.amount_centavos),
            "isDemo": p.is_demo,
            "verifiedAt": to_iso_utc(p.verified_at),
            "createdAt": to_iso_utc(p.created_at),
            "order": {
                "orderNumber": p.order.order_number,
                "grandTotalCentavos": p.order.grand_total_centavos,
                "paymentStatus": p.order.payment_status,
                "user": {"email": p.order.user.email} if p.order.user else None,
            } if p.order else None,
        })
    return {
        "success": True,
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1},
    }


@router.get("/users")
def admin_list_users(
    role: str | None = None,
    accountStatus: str | None = None,
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if accountStatus:
        q = q.filter(User.account_status == accountStatus)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term), User.store_name.ilike(term))
        )
    users = q.order_by(User.created_at.asc()).all()
    data = []
    for u in users:
        o_cnt = db.query(func.count(Order.id)).filter(Order.user_id == u.id).scalar() or 0
        p_cnt = db.query(func.count(Product.id)).filter(Product.seller_id == u.id).scalar() or 0
        data.append({
            "id": u.id,
            "email": u.email,
            "firstName": u.first_name,
            "lastName": u.last_name,
            "phone": u.phone,
            "role": u.role,
            "isActive": u.is_active,
            "accountStatus": u.account_status,
            "sellerStatus": u.seller_status,
            "storeName": u.store_name,
            "identificationDetails": u.identification_details,
            "createdAt": to_iso_utc(u.created_at),
            "_count": {"orders": o_cnt, "products": p_cnt},
        })
    return {"success": True, "data": data}


@router.patch("/users/{target_id}/role")
def admin_update_user_role(
    target_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    role = str(payload.get("role") or "").upper()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Valid role required")

    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id and role != "ADMIN":
        raise HTTPException(status_code=400, detail="Cannot demote your own administrator account (self-lockout prevented).")
    if target.role == "ADMIN" and role != "ADMIN":
        admin_cnt = db.query(func.count(User.id)).filter(User.role == "ADMIN", User.is_active == True, User.account_status == "ACTIVE").scalar() or 0  # noqa: E712
        if admin_cnt <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last remaining active administrator.")

    old_role = target.role
    target.role = role
    target.session_token_hash = None
    target.session_expires_at = None
    if role == "SELLER" and not target.seller_status:
        target.seller_status = "APPROVED"

    db.add(
        AuditLog(
            user_id=user.id,
            action="ADMIN_ASSIGN_USER_ROLE",
            entity_type="User",
            entity_id=target.id,
            old_values={"role": old_role},
            new_values={"role": role},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(target)
    return {
        "success": True,
        "message": f"Updated {target.email} role to {role}",
        "data": {
            "id": target.id,
            "email": target.email,
            "firstName": target.first_name,
            "lastName": target.last_name,
            "role": target.role,
            "accountStatus": target.account_status,
            "sellerStatus": target.seller_status,
        },
    }


@router.patch("/users/{target_id}/status")
def admin_update_user_status(
    target_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    acc_status = str(payload.get("accountStatus") or "").upper()
    if acc_status not in {"ACTIVE", "DEACTIVATED", "SUSPENDED"}:
        raise HTTPException(status_code=400, detail="Valid accountStatus required")

    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id and acc_status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Cannot suspend or deactivate your own administrator account.")
    if target.role == "ADMIN" and acc_status != "ACTIVE":
        admin_cnt = db.query(func.count(User.id)).filter(User.role == "ADMIN", User.is_active == True, User.account_status == "ACTIVE").scalar() or 0  # noqa: E712
        if admin_cnt <= 1:
            raise HTTPException(status_code=400, detail="Cannot suspend or deactivate the last remaining active administrator.")

    old_vals = {"accountStatus": target.account_status, "isActive": target.is_active}
    target.account_status = acc_status
    target.is_active = acc_status == "ACTIVE"
    if acc_status != "ACTIVE":
        target.session_token_hash = None
        target.session_expires_at = None

    db.add(
        AuditLog(
            user_id=user.id,
            action="ADMIN_UPDATE_USER_STATUS",
            entity_type="User",
            entity_id=target.id,
            old_values=old_vals,
            new_values={"accountStatus": acc_status, "isActive": target.is_active},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(target)
    return {
        "success": True,
        "message": f"User {target.email} account status set to {acc_status}",
        "data": {
            "id": target.id,
            "email": target.email,
            "firstName": target.first_name,
            "lastName": target.last_name,
            "role": target.role,
            "accountStatus": target.account_status,
            "isActive": target.is_active,
        },
    }


def _serialize_platform_cfg(cfg: PlatformConfig) -> dict[str, Any]:
    return {
        "id": cfg.id,
        "platformFeePercent": cfg.platform_fee_percent,
        "lowStockThreshold": cfg.low_stock_threshold,
        "shippingFeeCentavos": cfg.shipping_fee_centavos,
        "freeShippingThresholdCentavos": cfg.free_shipping_threshold_centavos,
        "enabledWallets": cfg.enabled_wallets,
        "sandboxMode": cfg.sandbox_mode,
        "updatedAt": to_iso_utc(cfg.updated_at),
    }


@router.get("/platform-config")
def admin_get_platform_config(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    if not cfg:
        cfg = PlatformConfig(id="default")
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return {"success": True, "data": _serialize_platform_cfg(cfg)}


@router.put("/platform-config")
def admin_update_platform_config(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    checks: dict[str, dict[str, Any]] = {}
    if "platformFeePercent" in payload:
        try:
            n = int(payload["platformFeePercent"])
            valid = 0 <= n <= 50
        except (TypeError, ValueError):
            n, valid = 0, False
        checks["platformFeePercent"] = {"valid": valid, "value": n, "error": None if valid else "Platform fee must be 0-50%."}
    if "lowStockThreshold" in payload:
        try:
            n = int(payload["lowStockThreshold"])
            valid = 0 <= n <= 1000
        except (TypeError, ValueError):
            n, valid = 0, False
        checks["lowStockThreshold"] = {"valid": valid, "value": n, "error": None if valid else "Low-stock threshold must be 0 or greater."}
    if "shippingFeeCentavos" in payload:
        try:
            n = int(payload["shippingFeeCentavos"])
            valid = n >= 0
        except (TypeError, ValueError):
            n, valid = 0, False
        checks["shippingFeeCentavos"] = {"valid": valid, "value": n, "error": None if valid else "Shipping fee must be 0 or greater."}
    if "freeShippingThresholdCentavos" in payload:
        try:
            n = int(payload["freeShippingThresholdCentavos"])
            valid = n >= 0
        except (TypeError, ValueError):
            n, valid = 0, False
        checks["freeShippingThresholdCentavos"] = {"valid": valid, "value": n, "error": None if valid else "Free shipping threshold must be 0 or greater."}
    if "enabledWallets" in payload:
        checks["enabledWallets"] = validate_required_text(payload["enabledWallets"], "Enabled e-wallets", min_len=2, max_len=120)

    collected = collect_field_errors(checks)
    if not collected["ok"]:
        return validation_error_response(collected)

    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    if not cfg:
        cfg = PlatformConfig(id="default")
        db.add(cfg)
    vals = collected["values"]
    if "platformFeePercent" in vals:
        cfg.platform_fee_percent = vals["platformFeePercent"]
    if "lowStockThreshold" in vals:
        cfg.low_stock_threshold = vals["lowStockThreshold"]
    if "shippingFeeCentavos" in vals:
        cfg.shipping_fee_centavos = vals["shippingFeeCentavos"]
    if "freeShippingThresholdCentavos" in vals:
        cfg.free_shipping_threshold_centavos = vals["freeShippingThresholdCentavos"]
    if "enabledWallets" in vals:
        cfg.enabled_wallets = vals["enabledWallets"]
    if "sandboxMode" in payload:
        cfg.sandbox_mode = bool(payload["sandboxMode"])

    serialized = _serialize_platform_cfg(cfg)
    db.add(
        AuditLog(
            user_id=user.id,
            action="ADMIN_UPDATE_PLATFORM_CONFIG",
            entity_type="PlatformConfig",
            entity_id="default",
            new_values=serialized,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    return {"success": True, "message": "Platform configuration settings updated", "data": serialized}


@router.get("/analytics")
def admin_analytics(
    period: str = Query(default="30d"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    resolved_period = period if period in {"7d", "30d", "90d", "all"} else "30d"
    now = utcnow_naive()
    period_start = None
    if resolved_period == "7d":
        period_start = now - timedelta(days=7)
    elif resolved_period == "30d":
        period_start = now - timedelta(days=30)
    elif resolved_period == "90d":
        period_start = now - timedelta(days=90)

    sellers = (
        db.query(User)
        .filter(User.role == "SELLER", User.seller_status == "APPROVED")
        .order_by(User.store_name.asc())
        .all()
    )
    seller_ids = [s.id for s in sellers]
    seller_products_map: dict[str, list[Product]] = {sid: [] for sid in seller_ids}
    seller_orders_map: dict[str, list[SellerOrder]] = {sid: [] for sid in seller_ids}
    if seller_ids:
        for p in db.query(Product).options(selectinload(Product.variants)).filter(Product.seller_id.in_(seller_ids)).all():
            if p.seller_id in seller_products_map:
                seller_products_map[p.seller_id].append(p)
        so_q = db.query(SellerOrder).filter(SellerOrder.seller_id.in_(seller_ids))
        if period_start is not None:
            so_q = so_q.filter(SellerOrder.created_at >= period_start)
        for so in so_q.all():
            if so.seller_id in seller_orders_map:
                seller_orders_map[so.seller_id].append(so)

    oi_q = (
        db.query(OrderItem)
        .options(
            selectinload(OrderItem.product_variant).selectinload(ProductVariant.product),
            selectinload(OrderItem.order).selectinload(Order.payments),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(OrderItem.fulfillment_status != "CANCELLED", Order.payment_status == "PAID", Order.order_status != "CANCELLED")
    )
    if period_start is not None:
        oi_q = oi_q.filter(Order.created_at >= period_start)
    paid_items = oi_q.all()

    seller_stats: dict[str, dict[str, Any]] = {}
    online_cutoff = now - timedelta(minutes=10)
    for s in sellers:
        active_prods = [p for p in seller_products_map.get(s.id, []) if p.is_active and p.status != "ARCHIVED"]
        low_cnt = sum(sum(1 for v in (p.variants or []) if v.is_active and v.stock_quantity <= 5) for p in active_prods)
        slices = seller_orders_map.get(s.id, [])
        non_cancel = [so for so in slices if so.status != "CANCELLED"]
        fulfilled = [so for so in non_cancel if so.status in {"SHIPPED", "DELIVERED"}]
        rate = round((len(fulfilled) / len(non_cancel)) * 100) if non_cancel else 0
        online_now = bool(s.last_seen_at and s.last_seen_at >= online_cutoff)
        seller_stats[s.id] = {
            "sellerId": s.id,
            "storeName": s.store_name or s.email,
            "email": s.email,
            "accountStatus": s.account_status,
            "lastSeenAt": to_iso_utc(s.last_seen_at),
            "onlineNow": online_now,
            "activeListings": len(active_prods),
            "lowStockItems": low_cnt,
            "fulfillmentRate": rate,
            "revenueCentavos": 0,
            "simulatedRevenueCentavos": 0,
            "gatewayRevenueCentavos": 0,
            "unitsSold": 0,
            "orderIds": set(),
        }

    plat_rev = sim_rev = gw_rev = units_sold = 0
    all_orders: set[str] = set()
    for item in paid_items:
        sid = item.product_variant.product.seller_id if (item.product_variant and item.product_variant.product) else None
        line_rev = item.unit_price_centavos * item.quantity
        paid_p = next((p for p in (item.order.payments or []) if p.status == "PAID"), None) if item.order else None
        is_sim = bool(paid_p and (paid_p.provider in {"SIMULATED", "demo_simulation"} or paid_p.is_demo))

        plat_rev += line_rev
        if is_sim:
            sim_rev += line_rev
        else:
            gw_rev += line_rev
        units_sold += item.quantity
        all_orders.add(item.order_id)

        if sid and sid in seller_stats:
            st = seller_stats[sid]
            st["revenueCentavos"] += line_rev
            if is_sim:
                st["simulatedRevenueCentavos"] += line_rev
            else:
                st["gatewayRevenueCentavos"] += line_rev
            st["unitsSold"] += item.quantity
            st["orderIds"].add(item.order_id)

    seller_rows = sorted(
        [
            {
                **{k: v for k, v in s.items() if k != "orderIds"},
                "revenueFormatted": format_peso(s["revenueCentavos"]),
                "orderCount": len(s["orderIds"]),
            }
            for s in seller_stats.values()
        ],
        key=lambda x: -x["revenueCentavos"],
    )

    return {
        "success": True,
        "data": {
            "period": resolved_period,
            "timezone": "Asia/Manila",
            "totals": {
                "revenueCentavos": plat_rev,
                "revenueFormatted": format_peso(plat_rev),
                "simulatedRevenueCentavos": sim_rev,
                "gatewayRevenueCentavos": gw_rev,
                "unitsSold": units_sold,
                "orderCount": len(all_orders),
                "approvedSellers": len(sellers),
                "onlineSellers": sum(1 for r in seller_rows if r["onlineNow"]),
            },
            "sellers": seller_rows,
        },
    }


@router.get("/api-settings")
def admin_get_api_settings(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = {r.key: r for r in db.query(SystemSetting).all()}

    def _get_val(key: str, env_key: str) -> str:
        row = rows.get(key)
        if row:
            dec = decrypt_setting(row.encrypted_value)
            if dec is not None:
                return dec
        return os.getenv(env_key, "")

    psgc_cfg = psgc_client.get_config()
    holiday_cfg = holiday_client.get_config()
    demo_mode = os.getenv("DEMO_MODE", "false") == "true"

    return {
        "success": True,
        "data": {
            "psgc": {
                "provider": "PSGC Philippine Address API (Free)",
                "baseUrl": psgc_cfg["baseUrl"],
                "host": psgc_cfg["host"],
                "cache": psgc_client.get_cache_stats(),
                "authRequired": False,
                "status": "OPERATIONAL",
            },
            "holidays": {
                "provider": "Nager.Date Public Holidays API (Free)",
                "baseUrl": holiday_cfg["baseUrl"],
                "host": holiday_cfg["host"],
                "countryCode": holiday_cfg["countryCode"],
                "cache": holiday_client.get_cache_stats(),
                "authRequired": False,
                "status": "OPERATIONAL",
            },
            "demoMode": demo_mode,
        },
    }


@router.put("/api-settings")
def admin_update_api_settings(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return {
        "success": True,
        "message": "External API integrations (PSGC & Public Holidays) are active and require no paid credentials.",
    }


@router.get("/webhooks")
def admin_list_webhooks(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    events = db.query(WebhookEvent).order_by(WebhookEvent.received_at.desc()).limit(50).all()
    return {
        "success": True,
        "data": [
            {
                "id": w.id,
                "provider": w.provider,
                "eventId": w.event_id,
                "eventType": w.event_type,
                "signatureValid": w.signature_valid,
                "status": w.status,
                "error": w.error,
                "receivedAt": to_iso_utc(w.received_at),
                "processedAt": to_iso_utc(w.processed_at),
            }
            for w in events
        ],
    }


@router.get("/health")
async def admin_system_health(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    t0 = time.monotonic()
    db_ok = True
    try:
        ping_database(db)
    except Exception:
        db_ok = False
    db_ms = int((time.monotonic() - t0) * 1000)

    psgc_h = await psgc_client.check_health(force_refresh=False)
    hol_h = await holiday_client.check_health(force_refresh=False)
    return {
        "success": True,
        "data": {
            "database": {"connected": db_ok, "latencyMs": db_ms},
            "psgc": psgc_h,
            "holidays": hol_h,
            "runtime": "Python FastAPI + SQLAlchemy 2.0",
            "timestamp": to_iso_utc(utcnow_naive()),
        },
    }
