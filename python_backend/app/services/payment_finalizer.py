"""Shared atomic payment finalization and canonical order status derivation."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from ..core.security import utcnow_naive
from ..models.models import AuditLog, Order, Payment, ProductVariant, SellerOrder, StockMovement


def derive_canonical_order_status(
    current_order_status: str,
    next_payment_status: str,
    item_statuses: list[str] | None = None,
) -> str:
    if current_order_status in {"PROCESSING", "SHIPPED", "DELIVERED", "RETURN_REQUESTED", "RETURNED"}:
        return current_order_status

    resolved = current_order_status
    if next_payment_status == "PAID" and resolved == "PENDING":
        resolved = "CONFIRMED"

    if item_statuses:
        if all(s == "CANCELLED" for s in item_statuses):
            resolved = "CANCELLED"
        elif all(s == "SHIPPED" for s in item_statuses):
            resolved = "SHIPPED"

    return resolved


def finalize_payment(
    db: Session,
    *,
    order_id: str,
    provider: str = "SIMULATED",
    payment_method: str = "gcash",
    reference_number: str | None = None,
    actor_id: str | None = None,
    is_demo: bool = False,
    ip_address: str | None = None,
) -> dict[str, Any]:
    now = utcnow_naive()
    resolved_ref = reference_number or f"SIM-{uuid.uuid4().hex[:8].upper()}"

    order = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.payment_status == "PAID":
        return {
            "alreadyPaid": True,
            "order": order,
            "stockConflicts": [],
            "referenceNumber": resolved_ref,
        }

    stock_conflicts: list[dict[str, Any]] = []
    if not order.stock_decremented:
        for item in order.items:
            if item.fulfillment_status == "CANCELLED":
                continue
            variant = (
                db.query(ProductVariant)
                .filter(ProductVariant.id == item.product_variant_id)
                .with_for_update()
                .first()
            )
            if variant and variant.stock_quantity >= item.quantity:
                variant.stock_quantity -= item.quantity
                db.add(
                    StockMovement(
                        product_variant_id=variant.id,
                        quantity_change=-item.quantity,
                        stock_after=variant.stock_quantity,
                        movement_type="OUTGOING",
                        reason="ORDER_PAID",
                        reference_id=order.order_number,
                    )
                )
            else:
                item.stock_conflict = True
                stock_conflicts.append({
                    "orderItemId": item.id,
                    "productVariantId": item.product_variant_id,
                    "productName": item.product_name,
                    "variantSku": item.variant_sku,
                    "requested": item.quantity,
                    "available": variant.stock_quantity if variant else 0,
                })

    next_status = derive_canonical_order_status(
        order.order_status,
        "PAID",
        [i.fulfillment_status for i in order.items],
    )
    order.payment_status = "PAID"
    order.payment_method = payment_method or order.payment_method
    order.order_status = next_status
    order.stock_decremented = True

    pending_payment = (
        db.query(Payment)
        .filter(Payment.order_id == order.id, Payment.status == "PENDING")
        .order_by(Payment.created_at.desc())
        .first()
    )
    if pending_payment:
        pending_payment.status = "PAID"
        pending_payment.provider = provider
        pending_payment.payment_method = payment_method or pending_payment.payment_method
        pending_payment.provider_payment_id = resolved_ref
        pending_payment.verified_at = now
        pending_payment.is_demo = bool(is_demo)
    else:
        db.add(
            Payment(
                order_id=order.id,
                provider=provider,
                payment_method=payment_method or order.payment_method or "gcash",
                provider_payment_id=resolved_ref,
                idempotency_key=f"pay-{order.id}-{uuid.uuid4()}",
                amount_centavos=order.grand_total_centavos,
                currency="PHP",
                status="PAID",
                is_demo=bool(is_demo),
                verified_at=now,
            )
        )

    db.query(SellerOrder).filter(
        SellerOrder.order_id == order.id,
        SellerOrder.status == "PENDING",
    ).update({"status": "PAID", "updated_at": now}, synchronize_session=False)

    db.add(
        AuditLog(
            user_id=actor_id,
            action="DEMO_PAYMENT_SIMULATED" if provider == "SIMULATED" else "EWALLET_PAYMENT_CONFIRMED",
            entity_type="Order",
            entity_id=order.id,
            new_values={
                "orderNumber": order.order_number,
                "provider": provider,
                "paymentMethod": payment_method,
                "referenceNumber": resolved_ref,
                "amountCentavos": order.grand_total_centavos,
                "stockConflictsCount": len(stock_conflicts),
            },
            ip_address=ip_address,
        )
    )

    if stock_conflicts:
        db.add(
            AuditLog(
                user_id=actor_id,
                action="STOCK_CONFLICT_DETECTED",
                entity_type="Order",
                entity_id=order.id,
                new_values={"orderNumber": order.order_number, "stockConflicts": stock_conflicts},
                ip_address=ip_address,
            )
        )

    db.commit()
    db.refresh(order)
    return {
        "alreadyPaid": False,
        "order": order,
        "stockConflicts": stock_conflicts,
        "referenceNumber": resolved_ref,
    }
