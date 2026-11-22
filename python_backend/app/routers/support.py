"""Customer Support ticket submission & Support Portal routes (/api/support/*)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import get_current_user, require_support, utcnow_naive
from ..core.serializers import serialize_order_item, serialize_payment, serialize_shipment, to_iso_utc
from ..core.validators import ALLOWED_TICKET_CATEGORIES, collect_field_errors, validate_required_text, validation_error_response
from ..models.models import (
    AuditLog,
    Order,
    ProductVariant,
    SellerOrder,
    StockMovement,
    SupportMessage,
    SupportTicket,
    User,
)

router = APIRouter(prefix="/api/support", tags=["Support"])


def _generate_ticket_number() -> str:
    return f"TKT-{utcnow_naive().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"


def _serialize_message(m: SupportMessage) -> dict[str, Any]:
    return {
        "id": m.id,
        "ticketId": m.ticket_id,
        "senderId": m.sender_id,
        "senderRole": m.sender_role,
        "senderName": m.sender_name,
        "message": m.message,
        "createdAt": to_iso_utc(m.created_at),
    }


def _serialize_ticket(t: SupportTicket, *, full_order: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": t.id,
        "ticketNumber": t.ticket_number,
        "userId": t.user_id,
        "orderId": t.order_id,
        "sellerId": t.seller_id,
        "assignedToId": t.assigned_to_id,
        "category": t.category,
        "subject": t.subject,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "refundAmountCentavos": t.refund_amount_centavos,
        "refundStatus": t.refund_status,
        "resolutionNotes": t.resolution_notes,
        "createdAt": to_iso_utc(t.created_at),
        "updatedAt": to_iso_utc(t.updated_at),
        "messages": [_serialize_message(m) for m in sorted(t.messages or [], key=lambda x: x.created_at)],
    }
    if getattr(t, "user", None):
        data["user"] = {
            "id": t.user.id,
            "firstName": t.user.first_name,
            "lastName": t.user.last_name,
            "email": t.user.email,
            "phone": t.user.phone,
        }
    if getattr(t, "assigned_to", None):
        data["assignedTo"] = {
            "id": t.assigned_to.id,
            "firstName": t.assigned_to.first_name,
            "lastName": t.assigned_to.last_name,
            "email": t.assigned_to.email,
        }
    if t.order:
        order_obj: dict[str, Any] = {
            "id": t.order.id,
            "orderNumber": t.order.order_number,
            "orderStatus": t.order.order_status,
            "paymentStatus": t.order.payment_status,
            "shippingStatus": t.order.shipping_status,
            "grandTotalCentavos": t.order.grand_total_centavos,
        }
        if full_order:
            order_obj["items"] = [serialize_order_item(i) for i in (t.order.items or [])]
            order_obj["payments"] = [serialize_payment(p) for p in (t.order.payments or [])]
            order_obj["shipments"] = [serialize_shipment(s) for s in (t.order.shipments or [])]
            order_obj["sellerOrders"] = [
                {
                    "id": so.id,
                    "sellerId": so.seller_id,
                    "status": so.status,
                    "seller": {"id": so.seller.id, "storeName": so.seller.store_name, "email": so.seller.email} if so.seller else None,
                }
                for so in (t.order.seller_orders or [])
            ]
        data["order"] = order_obj
    else:
        data["order"] = None
    return data


@router.post("/tickets")
def create_ticket(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category = str(payload.get("category") or "INQUIRY").upper()
    if category not in ALLOWED_TICKET_CATEGORIES:
        raise HTTPException(status_code=400, detail="Valid ticket category required")

    collected = collect_field_errors({
        "subject": validate_required_text(payload.get("subject"), "Subject", min_len=3, max_len=150),
        "description": validate_required_text(payload.get("description"), "Details / Reason", min_len=5, max_len=2000),
    })
    if not collected["ok"]:
        return validation_error_response(collected)

    subject = collected["values"]["subject"]
    description = collected["values"]["description"]
    priority = str(payload.get("priority") or "MEDIUM").upper()

    order = None
    if payload.get("orderId"):
        order = db.query(Order).options(selectinload(Order.seller_orders)).filter(Order.id == payload["orderId"]).first()
    elif payload.get("orderNumber"):
        order = db.query(Order).options(selectinload(Order.seller_orders)).filter(Order.order_number == payload["orderNumber"]).first()

    default_support = db.query(User).filter(User.role == "CUSTOMER_SUPPORT", User.is_active == True).first()  # noqa: E712
    is_refund_or_return = category in {"REFUND", "RETURN", "CANCELLATION"}

    ticket = SupportTicket(
        ticket_number=_generate_ticket_number(),
        user_id=user.id,
        order_id=order.id if order else None,
        seller_id=order.seller_orders[0].seller_id if (order and order.seller_orders) else None,
        assigned_to_id=default_support.id if default_support else None,
        category=category,
        subject=subject,
        description=description,
        status="OPEN",
        priority=priority,
        refund_status="PENDING" if is_refund_or_return else "NONE",
        refund_amount_centavos=order.grand_total_centavos if (is_refund_or_return and order) else None,
    )
    db.add(ticket)
    db.flush()

    db.add(
        SupportMessage(
            ticket_id=ticket.id,
            sender_id=user.id,
            sender_role=user.role,
            sender_name=f"{user.first_name} {user.last_name}",
            message=description,
        )
    )
    if order and category == "RETURN":
        order.order_status = "RETURN_REQUESTED"

    db.commit()
    loaded = (
        db.query(SupportTicket)
        .options(selectinload(SupportTicket.order), selectinload(SupportTicket.messages))
        .filter(SupportTicket.id == ticket.id)
        .first()
    )
    assert loaded is not None
    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "message": f"Support ticket {loaded.ticket_number} created successfully.",
            "data": _serialize_ticket(loaded),
        },
    )


@router.get("/my-tickets")
def my_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tickets = (
        db.query(SupportTicket)
        .options(selectinload(SupportTicket.order), selectinload(SupportTicket.messages))
        .filter(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
    return {"success": True, "data": [_serialize_ticket(t) for t in tickets]}


@router.post("/tickets/{ticket_id}/messages")
def post_ticket_message(
    ticket_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != user.id and user.role not in {"ADMIN", "CUSTOMER_SUPPORT"}:
        raise HTTPException(status_code=403, detail="Access denied")

    chk = validate_required_text(payload.get("message"), "Message", min_len=1, max_len=2000)
    if not chk["valid"]:
        raise HTTPException(status_code=400, detail=chk["error"])

    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        sender_role=user.role,
        sender_name=f"{user.first_name} {user.last_name}",
        message=chk["value"],
    )
    db.add(msg)

    if user.role in {"CUSTOMER_SUPPORT", "ADMIN"} and ticket.status == "OPEN":
        ticket.status = "IN_PROGRESS"
        ticket.assigned_to_id = ticket.assigned_to_id or user.id

    db.commit()
    db.refresh(msg)
    return JSONResponse(status_code=201, content={"success": True, "data": _serialize_message(msg)})


@router.get("/tickets")
def list_all_tickets(
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
    user: User = Depends(require_support),
    db: Session = Depends(get_db),
):
    q = db.query(SupportTicket).options(
        selectinload(SupportTicket.user),
        selectinload(SupportTicket.assigned_to),
        selectinload(SupportTicket.messages),
        selectinload(SupportTicket.order).selectinload(Order.items),
        selectinload(SupportTicket.order).selectinload(Order.payments),
        selectinload(SupportTicket.order).selectinload(Order.shipments),
        selectinload(SupportTicket.order).selectinload(Order.seller_orders).selectinload(SellerOrder.seller),
    )
    if status:
        q = q.filter(SupportTicket.status == status)
    if category:
        q = q.filter(SupportTicket.category == category)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                SupportTicket.ticket_number.ilike(term),
                SupportTicket.subject.ilike(term),
                SupportTicket.user.has(User.email.ilike(term)),
                SupportTicket.order.has(Order.order_number.ilike(term)),
            )
        )
    tickets = q.order_by(SupportTicket.created_at.desc()).all()
    return {"success": True, "data": [_serialize_ticket(t, full_order=True) for t in tickets]}


@router.get("/orders/lookup")
def support_order_lookup(
    q: str = "",
    orderNumber: str = "",
    user: User = Depends(require_support),
    db: Session = Depends(get_db),
):
    query_str = (orderNumber or q).strip()
    if not query_str:
        return {"success": True, "data": []}
    term = f"%{query_str}%"
    orders = (
        db.query(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.shipments),
        )
        .filter(
            or_(
                Order.order_number.ilike(term),
                Order.guest_email.ilike(term),
                Order.shipping_full_name.ilike(term),
                Order.user.has(User.email.ilike(term)),
            )
        )
        .order_by(Order.created_at.desc())
        .limit(20)
        .all()
    )
    out = []
    for o in orders:
        out.append({
            "id": o.id,
            "orderNumber": o.order_number,
            "orderStatus": o.order_status,
            "paymentStatus": o.payment_status,
            "shippingStatus": o.shipping_status,
            "grandTotalCentavos": o.grand_total_centavos,
            "shippingFullName": o.shipping_full_name,
            "shippingCity": o.shipping_city,
            "createdAt": to_iso_utc(o.created_at),
            "user": {"email": o.user.email, "firstName": o.user.first_name, "lastName": o.user.last_name} if o.user else None,
            "items": [serialize_order_item(i) for i in (o.items or [])],
            "payments": [serialize_payment(p) for p in (o.payments or [])],
            "shipments": [serialize_shipment(s) for s in (o.shipments or [])],
        })
    return {"success": True, "data": out}


@router.patch("/tickets/{ticket_id}/status")
def update_ticket_status(
    ticket_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_support),
    db: Session = Depends(get_db),
):
    status = str(payload.get("status") or "").upper()
    if status not in {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}:
        raise HTTPException(status_code=400, detail="Valid status required")

    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    old_status = ticket.status
    ticket.status = status
    ticket.assigned_to_id = ticket.assigned_to_id or user.id
    if payload.get("resolutionNotes") is not None:
        ticket.resolution_notes = str(payload["resolutionNotes"]).strip()

    db.add(
        AuditLog(
            user_id=user.id,
            action="SUPPORT_UPDATE_TICKET_STATUS",
            entity_type="SupportTicket",
            entity_id=ticket.id,
            old_values={"status": old_status},
            new_values={"status": status, "resolutionNotes": ticket.resolution_notes},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(ticket)
    return {
        "success": True,
        "message": f"Ticket {ticket.ticket_number} status updated to {status}",
        "data": _serialize_ticket(ticket),
    }


@router.patch("/tickets/{ticket_id}/action")
def process_ticket_action(
    ticket_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_support),
    db: Session = Depends(get_db),
):
    action = str(payload.get("action") or "").upper()
    if action not in {"APPROVE_CANCELLATION", "APPROVE_RETURN", "APPROVE_REFUND", "REJECT_REFUND"}:
        raise HTTPException(status_code=400, detail="Valid action required")

    ticket = (
        db.query(SupportTicket)
        .options(selectinload(SupportTicket.order).selectinload(Order.items))
        .filter(SupportTicket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    res_notes = str(payload.get("resolutionNotes") or "").strip() or None
    next_refund_status = ticket.refund_status
    next_ticket_status = "IN_PROGRESS"
    system_message = ""

    if action == "APPROVE_CANCELLATION":
        if ticket.order and ticket.order.order_status != "CANCELLED":
            for item in ticket.order.items:
                v = db.query(ProductVariant).filter(ProductVariant.id == item.product_variant_id).with_for_update().first()
                if v:
                    v.stock_quantity += item.quantity
                    db.add(
                        StockMovement(
                            product_variant_id=v.id,
                            quantity_change=item.quantity,
                            stock_after=v.stock_quantity,
                            movement_type="INCOMING",
                            reason=f"SUPPORT_CANCELLATION_{ticket.ticket_number}",
                            reference_id=user.id,
                        )
                    )
            ticket.order.order_status = "CANCELLED"
            db.query(SellerOrder).filter(SellerOrder.order_id == ticket.order.id).update(
                {"status": "CANCELLED", "notes": f"Cancelled via Support Ticket {ticket.ticket_number}"},
                synchronize_session=False,
            )
        next_refund_status = "APPROVED" if (ticket.order and ticket.order.payment_status == "PAID") else "NONE"
        next_ticket_status = "RESOLVED"
        extra = " and refund escalated to Finance Officer." if next_refund_status == "APPROVED" else "."
        system_message = f"Order cancellation approved by Support. Inventory restored{extra}"
    elif action == "APPROVE_RETURN":
        if ticket.order:
            ticket.order.order_status = "RETURNED"
            ticket.order.shipping_status = "RETURN_PENDING"
        next_refund_status = "APPROVED"
        next_ticket_status = "IN_PROGRESS"
        system_message = "Return request approved by Customer Support and escalated to Finance Officer for refund settlement."
    elif action == "APPROVE_REFUND":
        next_refund_status = "APPROVED"
        next_ticket_status = "IN_PROGRESS"
        system_message = "Refund request verified and approved by Customer Support. Forwarded to Finance Officer for payout settlement."
    elif action == "REJECT_REFUND":
        next_refund_status = "REJECTED"
        next_ticket_status = "RESOLVED"
        system_message = f"Refund/Return request declined: {res_notes or 'Does not meet return policy criteria.'}"

    ticket.status = next_ticket_status
    ticket.refund_status = next_refund_status
    if payload.get("refundAmountCentavos") is not None:
        ticket.refund_amount_centavos = int(payload["refundAmountCentavos"])
    elif not ticket.refund_amount_centavos:
        ticket.refund_amount_centavos = ticket.order.grand_total_centavos if ticket.order else 0
    ticket.resolution_notes = res_notes or system_message
    ticket.assigned_to_id = user.id

    db.add(
        SupportMessage(
            ticket_id=ticket.id,
            sender_id=user.id,
            sender_role=user.role,
            sender_name=f"{user.first_name} {user.last_name} (Support)",
            message=system_message,
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action=f"SUPPORT_{action}",
            entity_type="SupportTicket",
            entity_id=ticket.id,
            new_values={"action": action, "refundStatus": next_refund_status, "status": next_ticket_status},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(ticket)
    return {
        "success": True,
        "message": f"Action {action} completed on ticket {ticket.ticket_number}.",
        "data": _serialize_ticket(ticket),
    }
