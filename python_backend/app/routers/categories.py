"""Category browsing routes (/api/categories)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.serializers import to_iso_utc
from ..models.models import Category, Product

router = APIRouter(prefix="/api/categories", tags=["Categories"])


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Category, func.count(Product.id).label("product_count"))
        .outerjoin(Product, (Product.category_id == Category.id) & (Product.is_active == True))  # noqa: E712
        .filter(Category.is_active == True)  # noqa: E712
        .group_by(Category.id)
        .order_by(Category.sort_order.asc())
        .all()
    )
    data = [
        {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "imageUrl": cat.image_url,
            "sortOrder": cat.sort_order,
            "isActive": cat.is_active,
            "createdAt": to_iso_utc(cat.created_at),
            "_count": {"products": count},
        }
        for cat, count in rows
    ]
    return {"success": True, "data": data}


@router.get("/{slug}")
def get_category(slug: str, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.slug == slug, Category.is_active == True).first()  # noqa: E712
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    count = db.query(func.count(Product.id)).filter(Product.category_id == cat.id, Product.is_active == True).scalar() or 0  # noqa: E712
    return {
        "success": True,
        "data": {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "imageUrl": cat.image_url,
            "sortOrder": cat.sort_order,
            "isActive": cat.is_active,
            "createdAt": to_iso_utc(cat.created_at),
            "_count": {"products": count},
        },
    }
