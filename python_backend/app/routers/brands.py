"""Partner Brand Showcase routes (/api/brands)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.serializers import to_iso_utc
from ..models.models import Brand, Product

router = APIRouter(prefix="/api/brands", tags=["Brands"])


@router.get("")
def list_brands(db: Session = Depends(get_db)):
    brands = (
        db.query(Brand)
        .options(selectinload(Brand.seller))
        .filter(Brand.is_active == True)  # noqa: E712
        .order_by(Brand.name.asc())
        .all()
    )
    data = []
    for b in brands:
        prod_count = db.query(func.count(Product.id)).filter(Product.brand_id == b.id, Product.is_active == True).scalar() or 0  # noqa: E712
        data.append({
            "id": b.id,
            "name": b.name,
            "slug": b.slug,
            "description": b.description,
            "logoUrl": b.logo_url,
            "sellerId": b.seller_id,
            "isActive": b.is_active,
            "createdAt": to_iso_utc(b.created_at),
            "seller": {
                "id": b.seller.id,
                "storeName": b.seller.store_name,
                "sellerStatus": b.seller.seller_status,
            } if b.seller else None,
            "_count": {"products": prod_count},
        })
    return {"success": True, "data": data}


@router.get("/{slug}")
def get_brand(slug: str, db: Session = Depends(get_db)):
    brand = (
        db.query(Brand)
        .options(selectinload(Brand.seller))
        .filter(Brand.slug == slug, Brand.is_active == True)  # noqa: E712
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    products = (
        db.query(Product)
        .options(
            selectinload(Product.images),
            selectinload(Product.category),
            selectinload(Product.variants),
        )
        .filter(Product.brand_id == brand.id, Product.is_active == True)  # noqa: E712
        .order_by(Product.created_at.desc())
        .all()
    )
    return {
        "success": True,
        "data": {
            "id": brand.id,
            "name": brand.name,
            "slug": brand.slug,
            "description": brand.description,
            "logoUrl": brand.logo_url,
            "seller": {
                "id": brand.seller.id,
                "storeName": brand.seller.store_name,
                "storeDescription": brand.seller.store_description,
                "storeLogoUrl": brand.seller.store_logo_url,
            } if brand.seller else None,
            "products": [
                {
                    "id": p.id,
                    "name": p.name,
                    "slug": p.slug,
                    "basePriceCentavos": p.base_price_centavos,
                    "compareAtPriceCentavos": p.compare_at_price_centavos,
                    "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
                    "primaryImage": next((i.url for i in p.images if i.is_primary), p.images[0].url if p.images else None),
                    "totalStock": sum(v.stock_quantity for v in p.variants if v.is_active),
                }
                for p in products
            ],
        },
    }
