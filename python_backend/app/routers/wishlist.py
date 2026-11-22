"""Wishlist routes (/api/wishlist) for authenticated shoppers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import get_current_user
from ..core.serializers import format_peso, to_iso_utc
from ..models.models import Product, User, WishlistItem

router = APIRouter(prefix="/api/wishlist", tags=["Wishlist"])


def _load_wishlist(db: Session, user_id: str) -> list[dict[str, Any]]:
    items = (
        db.query(WishlistItem)
        .options(
            selectinload(WishlistItem.product).selectinload(Product.images),
            selectinload(WishlistItem.product).selectinload(Product.variants),
            selectinload(WishlistItem.product).selectinload(Product.category),
            selectinload(WishlistItem.product).selectinload(Product.seller),
        )
        .filter(WishlistItem.user_id == user_id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    out = []
    for w in items:
        p = w.product
        if not p or not p.is_active:
            continue
        imgs = sorted(p.images or [], key=lambda im: (not im.is_primary, im.sort_order))
        total_stock = sum(v.stock_quantity for v in (p.variants or []) if v.is_active)
        out.append({
            "id": w.id,
            "productId": p.id,
            "createdAt": to_iso_utc(w.created_at),
            "product": {
                "id": p.id,
                "name": p.name,
                "slug": p.slug,
                "basePriceCentavos": p.base_price_centavos,
                "basePriceFormatted": format_peso(p.base_price_centavos),
                "compareAtPriceCentavos": p.compare_at_price_centavos,
                "primaryImage": imgs[0].url if imgs else None,
                "totalStock": total_stock,
                "inStock": total_stock > 0,
                "category": {"name": p.category.name, "slug": p.category.slug} if p.category else None,
                "seller": {"id": p.seller.id, "storeName": p.seller.store_name} if p.seller else None,
            },
        })
    return out


@router.get("")
def get_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"success": True, "data": _load_wishlist(db, user.id)}


@router.post("/toggle")
def toggle_wishlist(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product_id = str(payload.get("productId") or "").strip()
    if not product_id:
        raise HTTPException(status_code=400, detail="Product ID is required")
    prod = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()  # noqa: E712
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = db.query(WishlistItem).filter(WishlistItem.user_id == user.id, WishlistItem.product_id == product_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"success": True, "data": {"wishlisted": False, "productId": product_id}, "message": "Removed from wishlist"}

    item = WishlistItem(user_id=user.id, product_id=product_id)
    db.add(item)
    db.commit()
    return {"success": True, "data": {"wishlisted": True, "productId": product_id}, "message": "Added to wishlist"}


@router.post("")
def add_to_wishlist(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product_id = str(payload.get("productId") or "").strip()
    if not product_id:
        raise HTTPException(status_code=400, detail="Product ID is required")
    prod = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()  # noqa: E712
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = db.query(WishlistItem).filter(WishlistItem.user_id == user.id, WishlistItem.product_id == product_id).first()
    if not existing:
        db.add(WishlistItem(user_id=user.id, product_id=product_id))
        db.commit()
    return {"success": True, "message": "Added to wishlist", "data": _load_wishlist(db, user.id)}


@router.delete("/{product_id}")
def remove_from_wishlist(
    product_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(WishlistItem).filter(
        WishlistItem.user_id == user.id,
        (WishlistItem.product_id == product_id) | (WishlistItem.id == product_id),
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    db.delete(existing)
    db.commit()
    return {"success": True, "message": "Removed from wishlist", "data": _load_wishlist(db, user.id)}
