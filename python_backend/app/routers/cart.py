"""Shopping Cart management routes (/api/cart)."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.database import get_db
from ..core.security import get_current_user, get_optional_user, utcnow_naive
from ..core.serializers import format_peso
from ..core.validators import validate_quantity
from ..models.models import Cart, CartItem, Product, ProductVariant, User

router = APIRouter(prefix="/api/cart", tags=["Cart"])


def _query_cart_with_items(db: Session, *, cart_id: str | None = None, user_id: str | None = None, session_id: str | None = None) -> Cart | None:
    q = (
        db.query(Cart)
        .options(
            selectinload(Cart.items)
            .selectinload(CartItem.product_variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.images)
        )
        .execution_options(populate_existing=True)
    )
    if cart_id:
        return q.filter(Cart.id == cart_id).first()
    if user_id:
        return q.filter(Cart.user_id == user_id).first()
    if session_id:
        return q.filter(Cart.session_id == session_id).first()
    return None


def _get_or_create_cart(db: Session, user_id: str | None, session_id: str | None) -> Cart:
    user_cart = _query_cart_with_items(db, user_id=user_id) if user_id else None
    guest_cart = _query_cart_with_items(db, session_id=session_id) if session_id else None

    # Merge guest cart into user cart if user just logged in
    if user_id and guest_cart and guest_cart.items:
        if not user_cart:
            guest_cart.user_id = user_id
            guest_cart.session_id = None
            db.commit()
            return _query_cart_with_items(db, cart_id=guest_cart.id)
        else:
            for g_item in guest_cart.items:
                existing = next((i for i in user_cart.items if i.product_variant_id == g_item.product_variant_id), None)
                if existing:
                    existing.quantity += g_item.quantity
                else:
                    g_item.cart_id = user_cart.id
            db.delete(guest_cart)
            db.commit()
            return _query_cart_with_items(db, cart_id=user_cart.id)

    if user_cart:
        return user_cart
    if guest_cart:
        return guest_cart

    cart = Cart(
        user_id=user_id,
        session_id=None if user_id else (session_id or str(uuid.uuid4())),
        expires_at=None if user_id else (utcnow_naive() + timedelta(days=7)),
    )
    db.add(cart)
    db.commit()
    return _query_cart_with_items(db, cart_id=cart.id)


def _format_cart_response(cart: Cart) -> dict[str, Any]:
    items = []
    for item in cart.items or []:
        variant = item.product_variant
        product = variant.product
        unit_price = variant.price_override_centavos or product.base_price_centavos
        line_total = unit_price * item.quantity
        imgs = sorted(product.images or [], key=lambda im: (not im.is_primary, im.sort_order))
        items.append({
            "id": item.id,
            "productVariantId": item.product_variant_id,
            "productId": product.id,
            "productName": product.name,
            "productSlug": product.slug,
            "variantSku": variant.variant_sku,
            "size": variant.size,
            "color": variant.color,
            "colorHex": variant.color_hex,
            "imageUrl": imgs[0].url if imgs else None,
            "unitPriceCentavos": unit_price,
            "quantity": item.quantity,
            "lineTotalCentavos": line_total,
            "stockAvailable": variant.stock_quantity,
            "isActive": bool(variant.is_active and product.is_active),
        })
    subtotal = sum(i["lineTotalCentavos"] for i in items)
    return {
        "id": cart.id,
        "itemCount": sum(i["quantity"] for i in items),
        "items": items,
        "subtotalCentavos": subtotal,
        "subtotalFormatted": format_peso(subtotal),
    }


def _set_guest_cookie(response: Response, cart: Cart, user_id: str | None) -> None:
    if not user_id and cart.session_id:
        settings = get_settings()
        response.set_cookie(
            key="cart_session",
            value=cart.session_id,
            httponly=True,
            secure=settings.cookie_secure or settings.node_env == "production",
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
        )


def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except ValueError:
        return False


@router.get("")
def get_cart(
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    cart = _get_or_create_cart(db, user_id, session_id)
    _set_guest_cookie(response, cart, user_id)
    return {"success": True, "data": _format_cart_response(cart)}


@router.post("/items")
def add_cart_item(
    request: Request,
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    variant_id = str(payload.get("productVariantId") or "").strip()
    if not variant_id or not _is_valid_uuid(variant_id):
        raise HTTPException(status_code=400, detail="Valid variant ID required")

    qty_chk = validate_quantity(payload.get("quantity"))
    if not qty_chk["valid"]:
        raise HTTPException(status_code=400, detail=qty_chk["error"])
    quantity = int(qty_chk["value"])

    variant = (
        db.query(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .filter(ProductVariant.id == variant_id)
        .first()
    )
    if not variant or not variant.is_active or not variant.product or not variant.product.is_active:
        raise HTTPException(status_code=404, detail="Product variant not found or unavailable")

    if variant.stock_quantity < quantity:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": f"Only {variant.stock_quantity} units available",
                "availableStock": variant.stock_quantity,
            },
        )

    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    cart = _get_or_create_cart(db, user_id, session_id)

    existing = (
        db.query(CartItem)
        .filter(CartItem.cart_id == cart.id, CartItem.product_variant_id == variant_id)
        .first()
    )
    if existing:
        new_qty = existing.quantity + quantity
        if new_qty > variant.stock_quantity:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": f"Cannot add {quantity} more. Cart already has {existing.quantity}, only {variant.stock_quantity} available.",
                },
            )
        if new_qty > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 per item")
        existing.quantity = new_qty
    else:
        db.add(CartItem(cart_id=cart.id, product_variant_id=variant_id, quantity=quantity))

    db.commit()
    db.expire_all()
    updated = _query_cart_with_items(db, cart_id=cart.id)
    assert updated is not None
    resp = JSONResponse(status_code=201, content={"success": True, "data": _format_cart_response(updated)})
    _set_guest_cookie(resp, cart, user_id)
    return resp


@router.patch("/items/{item_id}")
def update_cart_item(
    item_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if not _is_valid_uuid(item_id):
        raise HTTPException(status_code=400, detail="Valid item ID required")

    qty_chk = validate_quantity(payload.get("quantity"))
    if not qty_chk["valid"]:
        raise HTTPException(status_code=400, detail=qty_chk["error"])
    quantity = int(qty_chk["value"])

    item = (
        db.query(CartItem)
        .options(selectinload(CartItem.cart), selectinload(CartItem.product_variant))
        .filter(CartItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    if item.cart.user_id != user_id and item.cart.session_id != session_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if quantity > item.product_variant.stock_quantity:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": f"Only {item.product_variant.stock_quantity} available",
                "availableStock": item.product_variant.stock_quantity,
            },
        )

    item.quantity = quantity
    db.commit()
    updated = _query_cart_with_items(db, cart_id=item.cart_id)
    assert updated is not None
    return {"success": True, "data": _format_cart_response(updated)}


@router.delete("/items/{item_id}")
def remove_cart_item(
    item_id: str,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    item = db.query(CartItem).options(selectinload(CartItem.cart)).filter(CartItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    if item.cart.user_id != user_id and item.cart.session_id != session_id:
        raise HTTPException(status_code=403, detail="Access denied")

    cart_id = item.cart_id
    db.delete(item)
    db.commit()
    updated = _query_cart_with_items(db, cart_id=cart_id)
    assert updated is not None
    return {"success": True, "data": _format_cart_response(updated)}


@router.delete("")
def clear_cart(
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user_id = user.id if user else None
    session_id = request.cookies.get("cart_session") or request.headers.get("x-cart-session")
    cart = _query_cart_with_items(db, user_id=user_id, session_id=session_id) if (user_id or session_id) else None
    if cart:
        db.query(CartItem).filter(CartItem.cart_id == cart.id).delete(synchronize_session=False)
        db.commit()
    return {
        "success": True,
        "data": {
            "id": cart.id if cart else None,
            "itemCount": 0,
            "items": [],
            "subtotalCentavos": 0,
            "subtotalFormatted": "₱0.00",
        },
    }


@router.post("/merge")
def merge_cart(
    request: Request,
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_id = request.cookies.get("cart_session") or payload.get("sessionId")
    if not session_id:
        cart = _get_or_create_cart(db, user.id, None)
        return {"success": True, "data": _format_cart_response(cart)}

    guest_cart = db.query(Cart).options(selectinload(Cart.items)).filter(Cart.session_id == session_id).first()
    if not guest_cart or not guest_cart.items:
        cart = _get_or_create_cart(db, user.id, None)
        return {"success": True, "data": _format_cart_response(cart)}

    user_cart = _get_or_create_cart(db, user.id, None)
    for g_item in guest_cart.items:
        existing = (
            db.query(CartItem)
            .filter(CartItem.cart_id == user_cart.id, CartItem.product_variant_id == g_item.product_variant_id)
            .first()
        )
        if existing:
            existing.quantity = min(existing.quantity + g_item.quantity, 10)
        else:
            db.add(
                CartItem(
                    cart_id=user_cart.id,
                    product_variant_id=g_item.product_variant_id,
                    quantity=min(g_item.quantity, 10),
                )
            )

    db.delete(guest_cart)
    db.commit()
    response.delete_cookie("cart_session")
    merged = _query_cart_with_items(db, cart_id=user_cart.id)
    assert merged is not None
    return {"success": True, "data": _format_cart_response(merged)}
