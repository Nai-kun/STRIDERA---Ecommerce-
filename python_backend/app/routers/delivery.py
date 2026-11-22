"""Delivery Personnel Logistics Portal routes (/api/delivery/*)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import require_delivery, utcnow_naive
from ..core.serializers import serialize_shipment, to_iso_utc
from ..models.models import AuditLog, Order, SellerOrder, Shipment, User

router = APIRouter(prefix="/api/delivery", tags=["Delivery Portal"])

VALID_DELIVERY_STATUSES = {
    "PREPARING",
    "ASSIGNED",
    "COLLECTED",
    "SHIPPED",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED",
    "RETURN_PENDING",
}


def _serialize_delivery_shipment(s: Shipment) -> dict[str, Any]:
    data = serialize_shipment(s)
    if s.order:
        o = s.order
        data["order"] = {
            "id": o.id,
            "orderNumber": o.order_number,
            "orderStatus": o.order_status,
            "shippingStatus": o.shipping_status,
            "paymentStatus": o.payment_status,
            "paymentMethod": o.payment_method,
            "grandTotalCentavos": o.grand_total_centavos,
            "shippingFullName": o.shipping_full_name,
            "shippingPhone": o.shipping_phone,
            "shippingAddressLine1": o.shipping_address_line1,
            "shippingAddressLine2": o.shipping_address_line2,
            "shippingBarangay": o.shipping_barangay,
            "shippingCity": o.shipping_city,
            "shippingProvince": o.shipping_province,
            "shippingPostalCode": o.shipping_postal_code,
            "deliveryZone": o.delivery_zone,
            "estimatedDeliveryStart": o.estimated_delivery_start,
            "estimatedDeliveryEnd": o.estimated_delivery_end,
            "user": {"email": o.user.email, "phone": o.user.phone} if o.user else None,
            "items": [
                {
                    "id": i.id,
                    "productName": i.product_name,
                    "variantSku": i.variant_sku,
                    "size": i.size,
                    "color": i.color,
                    "quantity": i.quantity,
                }
                for i in (o.items or [])
            ],
        }
    return data


@router.get("/shipments")
def list_shipments(
    status: str | None = None,
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    q = db.query(Shipment).options(
        selectinload(Shipment.order).selectinload(Order.user),
        selectinload(Shipment.order).selectinload(Order.items),
        selectinload(Shipment.delivery_personnel),
    )
    if status:
        q = q.filter(Shipment.status == status)
    shipments = q.order_by(Shipment.updated_at.desc()).all()

    summary = {
        "total": len(shipments),
        "preparing": sum(1 for s in shipments if s.status in {"PREPARING", "ASSIGNED", "COLLECTED"}),
        "inTransit": sum(1 for s in shipments if s.status in {"SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"}),
        "delivered": sum(1 for s in shipments if s.status == "DELIVERED"),
        "failedOrReturn": sum(1 for s in shipments if s.status in {"FAILED", "RETURN_PENDING"}),
    }

    return {
        "success": True,
        "data": {
            "summary": summary,
            "shipments": [_serialize_delivery_shipment(s) for s in shipments],
        },
    }


@router.patch("/shipments/{shipment_id}/accept")
def accept_shipment(
    shipment_id: str,
    request: Request,
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = utcnow_naive()
    prev = list(shipment.history.get("events", [])) if isinstance(shipment.history, dict) else []
    next_status = "ASSIGNED" if shipment.status == "PREPARING" else shipment.status
    prev.append({
        "status": "ASSIGNED",
        "note": f"Delivery assignment accepted by {user.first_name} {user.last_name}",
        "actor": user.email,
        "timestamp": to_iso_utc(now),
    })

    shipment.delivery_personnel_id = user.id
    shipment.accepted_at = now
    shipment.status = next_status
    shipment.history = {"events": prev}

    db.add(
        AuditLog(
            user_id=user.id,
            action="DELIVERY_ACCEPT_ASSIGNMENT",
            entity_type="Shipment",
            entity_id=shipment.id,
            new_values={"deliveryPersonnelId": user.id, "acceptedAt": to_iso_utc(now)},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(shipment)
    return {"success": True, "message": "Delivery assignment accepted.", "data": serialize_shipment(shipment)}


@router.patch("/shipments/{shipment_id}/collect")
def collect_shipment(
    shipment_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = utcnow_naive()
    tracking_number = str(payload.get("trackingNumber") or shipment.tracking_number or f"STR-TRK-{shipment.id[:6].upper()}")
    prev = list(shipment.history.get("events", [])) if isinstance(shipment.history, dict) else []
    prev.append({
        "status": "SHIPPED",
        "note": f"Package collected from seller by {user.first_name} {user.last_name} (Tracking: {tracking_number})",
        "actor": user.email,
        "timestamp": to_iso_utc(now),
    })

    shipment.delivery_personnel_id = shipment.delivery_personnel_id or user.id
    shipment.accepted_at = shipment.accepted_at or now
    shipment.collected_at = now
    shipment.shipped_at = shipment.shipped_at or now
    shipment.tracking_number = tracking_number
    shipment.status = "SHIPPED"
    shipment.history = {"events": prev}

    if shipment.seller_order_id:
        db.query(SellerOrder).filter(SellerOrder.id == shipment.seller_order_id).update(
            {"status": "SHIPPED", "tracking_number": tracking_number, "shipped_at": now, "updated_at": now},
            synchronize_session=False,
        )
    db.query(Order).filter(Order.id == shipment.order_id).update(
        {"shipping_status": "SHIPPED", "order_status": "SHIPPED", "updated_at": now},
        synchronize_session=False,
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="DELIVERY_COLLECT_PACKAGE",
            entity_type="Shipment",
            entity_id=shipment.id,
            new_values={"status": "SHIPPED", "collectedAt": to_iso_utc(now), "trackingNumber": tracking_number},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(shipment)
    return {"success": True, "message": "Package collection confirmed. Shipment is now SHIPPED.", "data": serialize_shipment(shipment)}


@router.patch("/shipments/{shipment_id}/status")
def update_shipment_status(
    shipment_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    status_val = str(payload.get("status") or "").upper()
    if status_val not in VALID_DELIVERY_STATUSES:
        raise HTTPException(status_code=400, detail="Valid delivery status required")

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = utcnow_naive()
    old_status = shipment.status
    notes = str(payload.get("notes") or "").strip() or None
    recipient_name = str(payload.get("recipientName") or "").strip() or None
    pod_url = str(payload.get("proofOfDeliveryUrl") or "").strip() or None

    prev = list(shipment.history.get("events", [])) if isinstance(shipment.history, dict) else []
    prev.append({
        "status": status_val,
        "note": notes or f"Shipment updated to {status_val} by {user.first_name} {user.last_name}",
        "actor": user.email,
        "timestamp": to_iso_utc(now),
    })

    shipment.status = status_val
    shipment.delivery_personnel_id = shipment.delivery_personnel_id or user.id
    if notes:
        shipment.notes = notes
    if recipient_name:
        shipment.recipient_name = recipient_name
    if pod_url:
        shipment.proof_of_delivery_url = pod_url
    if status_val == "DELIVERED":
        shipment.delivered_at = now
    shipment.history = {"events": prev}

    order = db.query(Order).filter(Order.id == shipment.order_id).first()
    if order:
        if status_val in {"SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURN_PENDING"}:
            order.shipping_status = status_val
        if status_val == "DELIVERED":
            order.order_status = "DELIVERED"
            order.shipping_status = "DELIVERED"
            if shipment.seller_order_id:
                db.query(SellerOrder).filter(SellerOrder.id == shipment.seller_order_id).update(
                    {"status": "DELIVERED", "delivered_at": now, "updated_at": now},
                    synchronize_session=False,
                )

    db.add(
        AuditLog(
            user_id=user.id,
            action="DELIVERY_UPDATE_STATUS",
            entity_type="Shipment",
            entity_id=shipment.id,
            old_values={"status": old_status},
            new_values={"status": status_val, "notes": notes, "recipientName": recipient_name},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(shipment)
    return {"success": True, "message": f"Shipment updated to {status_val}.", "data": serialize_shipment(shipment)}


@router.patch("/shipments/{shipment_id}/fail")
def fail_shipment_delivery(
    shipment_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    failure_reason = str(payload.get("failureReason") or "Delivery attempt unsuccessful").strip()
    initiate_return = bool(payload.get("initiateReturn"))
    target_status = "RETURN_PENDING" if initiate_return else "FAILED"

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = utcnow_naive()
    prev = list(shipment.history.get("events", [])) if isinstance(shipment.history, dict) else []
    prev.append({
        "status": target_status,
        "note": f"Failed Delivery: {failure_reason}{' (Return to seller initiated)' if initiate_return else ''}",
        "actor": user.email,
        "timestamp": to_iso_utc(now),
    })

    shipment.status = target_status
    shipment.failure_reason = failure_reason
    shipment.history = {"events": prev}

    db.query(Order).filter(Order.id == shipment.order_id).update(
        {"shipping_status": target_status, "updated_at": now},
        synchronize_session=False,
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="DELIVERY_FAILED_ATTEMPT",
            entity_type="Shipment",
            entity_id=shipment.id,
            new_values={"status": target_status, "failureReason": failure_reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(shipment)
    return {
        "success": True,
        "message": f"Recorded delivery failure ({target_status}): {failure_reason}",
        "data": serialize_shipment(shipment),
    }
