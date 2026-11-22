"""Inventory Manager Warehouse Portal routes (/api/inventory/*)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import require_inventory, utcnow_naive
from ..core.serializers import format_peso, serialize_variant, to_iso_utc
from ..models.models import AuditLog, Category, Product, ProductVariant, StockMovement, User

router = APIRouter(prefix="/api/inventory", tags=["Inventory Portal"])


def _serialize_movement(m: StockMovement) -> dict[str, Any]:
    v = m.product_variant
    p = v.product if v else None
    return {
        "id": m.id,
        "productVariantId": m.product_variant_id,
        "quantityChange": m.quantity_change,
        "stockAfter": m.stock_after,
        "movementType": m.movement_type,
        "reason": m.reason,
        "referenceId": m.reference_id,
        "createdAt": to_iso_utc(m.created_at),
        "productVariant": {
            "id": v.id,
            "variantSku": v.variant_sku,
            "size": v.size,
            "color": v.color,
            "product": {
                "name": p.name,
                "sku": p.sku,
                "seller": {"storeName": p.seller.store_name} if p.seller else None,
            } if p else None,
        } if v else None,
    }


def _serialize_inventory_variant(v: ProductVariant) -> dict[str, Any]:
    d = serialize_variant(v)
    p = v.product
    d["product"] = {
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "basePriceCentavos": p.base_price_centavos,
        "isActive": p.is_active,
        "category": {"id": p.category.id, "name": p.category.name} if p.category else None,
        "seller": {"id": p.seller.id, "storeName": p.seller.store_name, "email": p.seller.email} if p.seller else None,
    } if p else None
    return d


@router.get("/dashboard")
def inventory_dashboard(user: User = Depends(require_inventory), db: Session = Depends(get_db)):
    total_products = db.query(Product).filter(Product.is_active == True).count()  # noqa: E712
    variants = (
        db.query(ProductVariant)
        .options(
            selectinload(ProductVariant.product).selectinload(Product.category),
            selectinload(ProductVariant.product).selectinload(Product.seller),
        )
        .order_by(ProductVariant.stock_quantity.asc())
        .all()
    )
    recent_movements = (
        db.query(StockMovement)
        .options(
            selectinload(StockMovement.product_variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.seller)
        )
        .order_by(StockMovement.created_at.desc())
        .limit(25)
        .all()
    )
    sellers = (
        db.query(User)
        .filter(User.role == "SELLER", User.seller_status == "APPROVED")
        .all()
    )

    total_variants = len(variants)
    total_units = sum(v.stock_quantity for v in variants)
    out_of_stock = [v for v in variants if v.stock_quantity == 0]
    low_stock = [v for v in variants if 0 < v.stock_quantity <= (v.low_stock_threshold or 5)]

    alerts = []
    for v in (out_of_stock + low_stock)[:20]:
        p = v.product
        alerts.append({
            "id": v.id,
            "variantSku": v.variant_sku,
            "size": v.size,
            "color": v.color,
            "stockQuantity": v.stock_quantity,
            "lowStockThreshold": v.low_stock_threshold,
            "isActive": v.is_active,
            "productName": p.name if p else None,
            "productSku": p.sku if p else None,
            "categoryName": p.category.name if (p and p.category) else None,
            "sellerName": p.seller.store_name if (p and p.seller and p.seller.store_name) else "STRIDERA Official",
        })

    return {
        "success": True,
        "data": {
            "totalProducts": total_products,
            "totalVariants": total_variants,
            "totalUnits": total_units,
            "lowStockCount": len(low_stock),
            "outOfStockCount": len(out_of_stock),
            "healthyCount": total_variants - len(low_stock) - len(out_of_stock),
            "sellers": [{"id": s.id, "storeName": s.store_name, "email": s.email} for s in sellers],
            "lowStockAlerts": alerts,
            "recentMovements": [_serialize_movement(m) for m in recent_movements],
        },
    }


@router.get("/variants")
def list_inventory_variants(
    sellerId: str | None = None,
    stockStatus: str | None = None,
    search: str | None = None,
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    q = db.query(ProductVariant).options(
        selectinload(ProductVariant.product).selectinload(Product.category),
        selectinload(ProductVariant.product).selectinload(Product.seller),
    )
    if sellerId:
        q = q.filter(ProductVariant.product.has(Product.seller_id == sellerId))
    if stockStatus == "out":
        q = q.filter(ProductVariant.stock_quantity == 0)
    elif stockStatus == "low":
        q = q.filter(ProductVariant.stock_quantity > 0, ProductVariant.stock_quantity <= 5)
    elif stockStatus == "healthy":
        q = q.filter(ProductVariant.stock_quantity > 5)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ProductVariant.variant_sku.ilike(term),
                ProductVariant.color.ilike(term),
                ProductVariant.product.has(Product.name.ilike(term)),
                ProductVariant.product.has(Product.sku.ilike(term)),
            )
        )

    variants = q.order_by(ProductVariant.stock_quantity.asc(), ProductVariant.variant_sku.asc()).all()
    return {"success": True, "data": [_serialize_inventory_variant(v) for v in variants]}


@router.post("/incoming")
def record_incoming_stock(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    variant_id = str(payload.get("variantId") or payload.get("productVariantId") or "").strip()
    try:
        qty = int(payload.get("quantity"))
    except (TypeError, ValueError):
        qty = 0
    reason = str(payload.get("reason") or "Supplier Restock").strip()

    if not variant_id or qty < 1:
        raise HTTPException(status_code=400, detail="Valid variantId and positive integer quantity required")

    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    old_stock = variant.stock_quantity
    variant.stock_quantity += qty
    db.add(
        StockMovement(
            product_variant_id=variant.id,
            quantity_change=qty,
            stock_after=variant.stock_quantity,
            movement_type="INCOMING",
            reason=f"INCOMING: {reason}",
            reference_id=str(payload.get("referenceId") or user.id),
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="INVENTORY_INCOMING_STOCK",
            entity_type="ProductVariant",
            entity_id=variant.id,
            old_values={"stockQuantity": old_stock},
            new_values={"stockQuantity": variant.stock_quantity, "quantityChange": qty, "reason": reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(variant)
    return {
        "success": True,
        "message": f"Recorded +{qty} incoming units for {variant.variant_sku}. New stock: {variant.stock_quantity}.",
        "data": serialize_variant(variant),
    }


@router.post("/outgoing")
def record_outgoing_stock(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    variant_id = str(payload.get("variantId") or payload.get("productVariantId") or "").strip()
    try:
        qty = int(payload.get("quantity"))
    except (TypeError, ValueError):
        qty = 0
    reason = str(payload.get("reason") or "Warehouse Dispatch").strip()

    if not variant_id or qty < 1:
        raise HTTPException(status_code=400, detail="Valid variantId and positive integer quantity required")

    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    if variant.stock_quantity < qty:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Only {variant.stock_quantity} units available.")

    old_stock = variant.stock_quantity
    variant.stock_quantity -= qty
    db.add(
        StockMovement(
            product_variant_id=variant.id,
            quantity_change=-qty,
            stock_after=variant.stock_quantity,
            movement_type="OUTGOING",
            reason=f"OUTGOING: {reason}",
            reference_id=str(payload.get("referenceId") or user.id),
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="INVENTORY_OUTGOING_STOCK",
            entity_type="ProductVariant",
            entity_id=variant.id,
            old_values={"stockQuantity": old_stock},
            new_values={"stockQuantity": variant.stock_quantity, "quantityChange": -qty, "reason": reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(variant)
    return {
        "success": True,
        "message": f"Recorded -{qty} outgoing units for {variant.variant_sku}. New stock: {variant.stock_quantity}.",
        "data": serialize_variant(variant),
    }


@router.patch("/variants/{variant_id}/adjust")
def adjust_variant_stock(
    variant_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Audit reason required")

    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    old_stock = variant.stock_quantity
    if "quantityChange" in payload and payload["quantityChange"] is not None:
        try:
            delta = int(payload["quantityChange"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Valid quantityChange integer required") from exc
        new_stock = old_stock + delta
    elif "newQuantity" in payload and payload["newQuantity"] is not None:
        try:
            new_stock = int(payload["newQuantity"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Valid newQuantity integer required") from exc
        delta = new_stock - old_stock
    else:
        raise HTTPException(status_code=400, detail="quantityChange or newQuantity required")

    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Stock cannot drop below zero")

    variant.stock_quantity = new_stock
    db.add(
        StockMovement(
            product_variant_id=variant.id,
            quantity_change=delta,
            stock_after=new_stock,
            movement_type="ADJUSTMENT",
            reason=f"MANUAL_ADJUSTMENT: {reason}",
            reference_id=user.id,
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="INVENTORY_MANUAL_ADJUSTMENT",
            entity_type="ProductVariant",
            entity_id=variant.id,
            old_values={"stockQuantity": old_stock},
            new_values={"stockQuantity": new_stock, "quantityChange": delta, "reason": reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(variant)

    sign_str = f"+{delta}" if delta >= 0 else str(delta)
    return {
        "success": True,
        "message": f"Stock adjusted by {sign_str}. New stock: {new_stock}.",
        "data": serialize_variant(variant),
    }


@router.patch("/variants/{variant_id}/availability")
def toggle_variant_availability(
    variant_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    old_active = variant.is_active
    next_active = bool(payload["isActive"]) if isinstance(payload.get("isActive"), bool) else (not old_active)
    variant.is_active = next_active

    db.add(
        AuditLog(
            user_id=user.id,
            action="INVENTORY_TOGGLE_AVAILABILITY",
            entity_type="ProductVariant",
            entity_id=variant.id,
            old_values={"isActive": old_active},
            new_values={"isActive": next_active},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(variant)
    return {
        "success": True,
        "message": f"Variant {variant.variant_sku} marked as {'AVAILABLE' if next_active else 'UNAVAILABLE'}",
        "data": serialize_variant(variant),
    }


@router.get("/movements")
def list_stock_movements(
    movementType: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_inventory),
    db: Session = Depends(get_db),
):
    q = db.query(StockMovement).options(
        selectinload(StockMovement.product_variant)
        .selectinload(ProductVariant.product)
        .selectinload(Product.seller)
    )
    if movementType:
        q = q.filter(StockMovement.movement_type == movementType)
    movements = q.order_by(StockMovement.created_at.desc()).limit(limit).all()
    return {"success": True, "data": [_serialize_movement(m) for m in movements]}


@router.get("/report")
def inventory_report(user: User = Depends(require_inventory), db: Session = Depends(get_db)):
    variants = (
        db.query(ProductVariant)
        .options(
            selectinload(ProductVariant.product).selectinload(Product.category),
            selectinload(ProductVariant.product).selectinload(Product.seller),
        )
        .all()
    )
    movements = db.query(StockMovement).order_by(StockMovement.created_at.desc()).limit(100).all()

    by_seller: dict[str, dict[str, Any]] = {}
    total_val = 0
    for v in variants:
        p = v.product
        s_name = p.seller.store_name if (p and p.seller and p.seller.store_name) else "STRIDERA Official"
        unit_price = v.price_override_centavos or (p.base_price_centavos if p else 0)
        val_c = unit_price * v.stock_quantity
        total_val += val_c

        slot = by_seller.setdefault(
            s_name,
            {
                "sellerName": s_name,
                "variantCount": 0,
                "totalUnits": 0,
                "lowStockCount": 0,
                "outOfStockCount": 0,
                "valuationCentavos": 0,
            },
        )
        slot["variantCount"] += 1
        slot["totalUnits"] += v.stock_quantity
        slot["valuationCentavos"] += val_c
        if v.stock_quantity == 0:
            slot["outOfStockCount"] += 1
        elif v.stock_quantity <= (v.low_stock_threshold or 5):
            slot["lowStockCount"] += 1

    mov_summary = {
        "INCOMING": sum(m.quantity_change for m in movements if m.movement_type == "INCOMING"),
        "OUTGOING": sum(abs(m.quantity_change) for m in movements if m.movement_type == "OUTGOING"),
        "ADJUSTMENT": sum(1 for m in movements if m.movement_type == "ADJUSTMENT"),
    }

    return {
        "success": True,
        "data": {
            "generatedAt": to_iso_utc(utcnow_naive()),
            "totalVariants": len(variants),
            "totalUnits": sum(v.stock_quantity for v in variants),
            "totalInventoryValuationCentavos": total_val,
            "totalInventoryValuationFormatted": format_peso(total_val),
            "bySeller": [
                {**s, "valuationFormatted": format_peso(s["valuationCentavos"])}
                for s in by_seller.values()
            ],
            "movementSummary": mov_summary,
        },
    }
