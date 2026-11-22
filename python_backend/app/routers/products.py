"""Catalog browsing, filtering, product detail, and product reviews routes (/api/products/*)."""

from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import get_current_user, get_optional_user
from ..core.serializers import to_iso_utc
from ..core.validators import validate_required_text
from ..models.models import Brand, Category, Product, ProductReview, ProductVariant, User, WishlistItem

router = APIRouter(prefix="/api/products", tags=["Products"])


def _active_catalog_filter():
    return (
        (Product.is_active == True)  # noqa: E712
        & (Product.status == "ACTIVE")
        & or_(
            Product.seller_id.is_(None),
            Product.seller.has(
                (User.seller_status == "APPROVED") & (User.account_status == "ACTIVE") & (User.is_active == True)  # noqa: E712
            ),
        )
    )


def _serialize_catalog_card(p: Product) -> dict[str, Any]:
    imgs = sorted(p.images or [], key=lambda im: (not im.is_primary, im.sort_order))
    active_variants = [v for v in (p.variants or []) if v.is_active]
    total_stock = sum(v.stock_quantity for v in active_variants)
    colors = list(dict.fromkeys(v.color for v in active_variants if v.color))
    sizes = list(dict.fromkeys(v.size for v in active_variants if v.size))
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "sku": p.sku,
        "description": p.description,
        "basePriceCentavos": p.base_price_centavos,
        "compareAtPriceCentavos": p.compare_at_price_centavos,
        "audience": p.audience,
        "shoeType": p.shoe_type,
        "status": p.status,
        "isActive": p.is_active,
        "isFeatured": p.is_featured,
        "createdAt": to_iso_utc(p.created_at),
        "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
        "brand": {"id": p.brand.id, "name": p.brand.name, "slug": p.brand.slug, "logoUrl": p.brand.logo_url} if p.brand else None,
        "seller": {"id": p.seller.id, "storeName": p.seller.store_name, "storeLogoUrl": p.seller.store_logo_url} if p.seller else None,
        "primaryImage": imgs[0].url if imgs else None,
        "primaryImageAlt": (imgs[0].alt_text or p.name) if imgs else p.name,
        "totalStock": total_stock,
        "inStock": total_stock > 0,
        "availableColors": colors,
        "availableSizes": sizes,
    }


@router.get("")
def list_products(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=48),
    category: str | None = None,
    brand: str | None = None,
    seller: str | None = None,
    audience: str | None = None,
    shoeType: str | None = None,
    search: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    color: str | None = None,
    size: str | None = None,
    sort: str = "newest",
    featured: str | None = None,
    inStock: str | None = None,
    db: Session = Depends(get_db),
):
    q = (
        db.query(Product)
        .options(
            selectinload(Product.category),
            selectinload(Product.brand),
            selectinload(Product.seller),
            selectinload(Product.images),
            selectinload(Product.variants),
        )
        .filter(_active_catalog_filter())
    )

    if category:
        q = q.filter(Product.category.has(Category.slug == category))
    if brand:
        q = q.filter(Product.brand.has(Brand.slug == brand))
    if seller:
        q = q.filter(Product.seller_id == seller)
    if audience:
        q = q.filter(Product.audience == audience.upper())
    if shoeType:
        q = q.filter(Product.shoe_type == shoeType.upper())
    if featured == "true":
        q = q.filter(Product.is_featured == True)  # noqa: E712
    if minPrice is not None:
        q = q.filter(Product.base_price_centavos >= int(minPrice * 100))
    if maxPrice is not None:
        q = q.filter(Product.base_price_centavos <= int(maxPrice * 100))
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(term),
                Product.description.ilike(term),
                Product.sku.ilike(term),
                Product.category.has(Category.name.ilike(term)),
                Product.brand.has(Brand.name.ilike(term)),
                Product.seller.has(User.store_name.ilike(term)),
            )
        )
    if color:
        q = q.filter(Product.variants.any((ProductVariant.is_active == True) & ProductVariant.color.ilike(f"%{color.strip()}%")))  # noqa: E712
    if size:
        q = q.filter(Product.variants.any((ProductVariant.is_active == True) & (ProductVariant.size == size.strip())))  # noqa: E712
    if inStock == "true":
        q = q.filter(Product.variants.any((ProductVariant.is_active == True) & (ProductVariant.stock_quantity > 0)))  # noqa: E712

    if sort == "price_asc":
        q = q.order_by(Product.base_price_centavos.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.base_price_centavos.desc())
    elif sort == "name_asc":
        q = q.order_by(Product.name.asc())
    else:
        q = q.order_by(Product.created_at.desc())

    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "success": True,
        "data": {
            "products": [_serialize_catalog_card(p) for p in items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": max(1, math.ceil(total / limit)) if total else 1,
            },
        },
    }


@router.get("/featured")
def get_featured_products(db: Session = Depends(get_db)):
    products = (
        db.query(Product)
        .options(
            selectinload(Product.category),
            selectinload(Product.seller),
            selectinload(Product.images),
            selectinload(Product.variants),
        )
        .filter(Product.is_active == True, Product.is_featured == True)  # noqa: E712
        .order_by(Product.created_at.desc())
        .limit(8)
        .all()
    )
    formatted = []
    for p in products:
        imgs = sorted([im for im in (p.images or []) if im.is_primary], key=lambda im: im.sort_order)
        if not imgs and p.images:
            imgs = sorted(p.images, key=lambda im: im.sort_order)
        active_vars = [v for v in (p.variants or []) if v.is_active]
        formatted.append({
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
            "seller": {"id": p.seller.id, "storeName": p.seller.store_name} if p.seller else None,
            "basePriceCentavos": p.base_price_centavos,
            "compareAtPriceCentavos": p.compare_at_price_centavos,
            "primaryImage": imgs[0].url if imgs else None,
            "primaryImageAlt": (imgs[0].alt_text or p.name) if imgs else p.name,
            "totalStock": sum(v.stock_quantity for v in active_vars),
            "availableColors": list(dict.fromkeys(v.color for v in active_vars)),
        })
    return {"success": True, "data": formatted}


@router.get("/filters")
def get_product_filters(db: Session = Depends(get_db)):
    cats = db.query(Category).filter(Category.is_active == True).order_by(Category.sort_order.asc()).all()  # noqa: E712
    brands = db.query(Brand).filter(Brand.is_active == True).order_by(Brand.name.asc()).all()  # noqa: E712
    sellers = (
        db.query(User)
        .filter(User.role == "SELLER", User.seller_status == "APPROVED", User.is_active == True)  # noqa: E712
        .order_by(User.store_name.asc())
        .all()
    )
    active_vars = (
        db.query(ProductVariant)
        .join(Product, ProductVariant.product_id == Product.id)
        .filter(ProductVariant.is_active == True, Product.is_active == True)  # noqa: E712
        .all()
    )
    color_map: dict[str, str | None] = {}
    size_set: set[str] = set()
    for v in active_vars:
        if v.color and v.color not in color_map:
            color_map[v.color] = v.color_hex
        if v.size:
            size_set.add(v.size)

    agg = db.query(func.min(Product.base_price_centavos), func.max(Product.base_price_centavos)).filter(Product.is_active == True).first()  # noqa: E712
    min_c, max_c = (agg[0], agg[1]) if agg else (None, None)

    return {
        "success": True,
        "data": {
            "categories": [{"id": c.id, "name": c.name, "slug": c.slug} for c in cats],
            "brands": [{"id": b.id, "name": b.name, "slug": b.slug, "logoUrl": b.logo_url} for b in brands],
            "sellers": [{"id": s.id, "storeName": s.store_name, "storeLogoUrl": s.store_logo_url} for s in sellers],
            "colors": [{"name": k, "hex": v} for k, v in color_map.items()],
            "sizes": sorted(size_set),
            "audiences": ["MEN", "WOMEN", "UNISEX"],
            "shoeTypes": ["RUNNING", "LIFESTYLE", "BASKETBALL", "TRAINING", "CASUAL", "BOOTS"],
            "priceRange": {
                "min": (min_c / 100) if min_c else 0,
                "max": (max_c / 100) if max_c else 10000,
            },
        },
    }


@router.get("/{slug}")
def get_product_detail(
    slug: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .options(
            selectinload(Product.category),
            selectinload(Product.brand),
            selectinload(Product.seller),
            selectinload(Product.images),
            selectinload(Product.variants),
            selectinload(Product.reviews).selectinload(ProductReview.user),
        )
        .filter(Product.slug == slug)
        .first()
    )
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")

    is_wishlisted = False
    if user:
        w = db.query(WishlistItem).filter(WishlistItem.user_id == user.id, WishlistItem.product_id == product.id).first()
        is_wishlisted = w is not None

    related = (
        db.query(Product)
        .options(selectinload(Product.images), selectinload(Product.category), selectinload(Product.seller), selectinload(Product.variants))
        .filter(Product.category_id == product.category_id, Product.id != product.id, Product.is_active == True)  # noqa: E712
        .limit(4)
        .all()
    )

    active_variants = sorted([v for v in (product.variants or []) if v.is_active], key=lambda v: (v.color, v.size))
    color_groups: dict[str, dict[str, Any]] = {}
    for v in active_variants:
        grp = color_groups.setdefault(v.color, {"color": v.color, "colorHex": v.color_hex, "sizes": []})
        grp["sizes"].append({
            "id": v.id,
            "size": v.size,
            "variantSku": v.variant_sku,
            "stockQuantity": v.stock_quantity,
            "priceCentavos": v.price_override_centavos or product.base_price_centavos,
        })

    reviews = sorted(product.reviews or [], key=lambda r: r.created_at, reverse=True)
    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 5.0
    imgs = sorted(product.images or [], key=lambda im: im.sort_order)

    return {
        "success": True,
        "data": {
            "id": product.id,
            "categoryId": product.category_id,
            "sellerId": product.seller_id,
            "brandId": product.brand_id,
            "name": product.name,
            "slug": product.slug,
            "sku": product.sku,
            "description": product.description,
            "features": product.features,
            "basePriceCentavos": product.base_price_centavos,
            "compareAtPriceCentavos": product.compare_at_price_centavos,
            "audience": product.audience,
            "shoeType": product.shoe_type,
            "status": product.status,
            "isActive": product.is_active,
            "isFeatured": product.is_featured,
            "createdAt": to_iso_utc(product.created_at),
            "category": {"id": product.category.id, "name": product.category.name, "slug": product.category.slug} if product.category else None,
            "brand": {
                "id": product.brand.id,
                "name": product.brand.name,
                "slug": product.brand.slug,
                "description": product.brand.description,
                "logoUrl": product.brand.logo_url,
            } if product.brand else None,
            "seller": {
                "id": product.seller.id,
                "storeName": product.seller.store_name,
                "storeDescription": product.seller.store_description,
                "storeLogoUrl": product.seller.store_logo_url,
                "sellerStatus": product.seller.seller_status,
            } if product.seller else None,
            "images": [{"id": im.id, "url": im.url, "altText": im.alt_text, "sortOrder": im.sort_order, "isPrimary": im.is_primary} for im in imgs],
            "variants": [
                {
                    "id": v.id,
                    "variantSku": v.variant_sku,
                    "size": v.size,
                    "color": v.color,
                    "colorHex": v.color_hex,
                    "priceOverrideCentavos": v.price_override_centavos,
                    "stockQuantity": v.stock_quantity,
                    "lowStockThreshold": v.low_stock_threshold,
                    "isActive": v.is_active,
                }
                for v in active_variants
            ],
            "reviews": [
                {
                    "id": r.id,
                    "rating": r.rating,
                    "sellerRating": r.seller_rating,
                    "comment": r.comment,
                    "orderNumber": r.order_number,
                    "createdAt": to_iso_utc(r.created_at),
                    "user": {"id": r.user.id, "firstName": r.user.first_name, "lastName": r.user.last_name} if r.user else None,
                }
                for r in reviews
            ],
            "averageRating": avg_rating,
            "isWishlisted": is_wishlisted,
            "colorGroups": list(color_groups.values()),
            "relatedProducts": [
                {
                    "id": r.id,
                    "name": r.name,
                    "slug": r.slug,
                    "category": {"name": r.category.name, "slug": r.category.slug} if r.category else None,
                    "seller": {"id": r.seller.id, "storeName": r.seller.store_name} if r.seller else None,
                    "basePriceCentavos": r.base_price_centavos,
                    "compareAtPriceCentavos": r.compare_at_price_centavos,
                    "primaryImage": next((i.url for i in r.images if i.is_primary), r.images[0].url if r.images else None),
                    "totalStock": sum(v.stock_quantity for v in r.variants if v.is_active),
                }
                for r in related
            ],
        },
    }


@router.post("/{slug}/reviews")
def submit_review(
    slug: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.slug == slug, Product.is_active == True).first()  # noqa: E712
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    chk = validate_required_text(payload.get("comment"), "Review comment", min_len=3, max_len=2000)
    if not chk["valid"]:
        raise HTTPException(status_code=400, detail=chk["error"])

    try:
        rating_val = min(5, max(1, int(payload.get("rating", 5))))
    except (TypeError, ValueError):
        rating_val = 5
    try:
        seller_rating_val = min(5, max(1, int(payload.get("sellerRating", 5))))
    except (TypeError, ValueError):
        seller_rating_val = 5

    review = ProductReview(
        product_id=product.id,
        user_id=user.id,
        order_number=payload.get("orderNumber") or None,
        rating=rating_val,
        seller_rating=seller_rating_val,
        comment=chk["value"],
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "data": {
                "id": review.id,
                "productId": review.product_id,
                "userId": review.user_id,
                "orderNumber": review.order_number,
                "rating": review.rating,
                "sellerRating": review.seller_rating,
                "comment": review.comment,
                "createdAt": to_iso_utc(review.created_at),
                "user": {"id": user.id, "firstName": user.first_name, "lastName": user.last_name},
            },
        },
    )
