"""Prototype E-Wallet Sandbox & Payment confirmation routes (/api/payments/*)."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.database import get_db
from ..core.security import get_current_user, get_optional_user
from ..core.serializers import format_peso, serialize_payment, to_iso_utc
from ..models.models import AuditLog, Order, Payment, PlatformConfig, User
from ..services.payment_finalizer import finalize_payment

router = APIRouter(prefix="/api/payments", tags=["Payments"])

WALLET_LABELS = {"gcash": "GCash", "maya": "Maya", "paypal": "PayPal"}


def _is_demo_fallback_enabled() -> bool:
    settings = get_settings()
    fallback_env = os.getenv("DEMO_FALLBACK_ENABLED", "true").lower() != "false"
    return fallback_env and settings.demo_mode


@router.post("/create-session")
def create_payment_session(
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    order_number = str(payload.get("orderNumber") or "").strip()
    if not order_number:
        raise HTTPException(status_code=400, detail="Order number required")

    order = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .filter(Order.order_number == order_number)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.user_id and (not user or (order.user_id != user.id and user.role != "ADMIN")):
        raise HTTPException(status_code=403, detail="Access denied")

    if order.payment_status == "PAID":
        return {"success": True, "message": "Order is already paid", "data": {"alreadyPaid": True, "order": {"orderNumber": order.order_number}}}

    payment_method = str(payload.get("paymentMethod") or order.payment_method or "gcash").lower()
    if payment_method not in WALLET_LABELS:
        raise HTTPException(status_code=400, detail="Invalid payment method. Choose GCash, Maya, or PayPal.")

    wallet_label = WALLET_LABELS[payment_method]
    reference_number = f"STR-{payment_method.upper()}-{uuid.uuid4().hex[:8].upper()}"
    idempotency_key = f"pay-{order.id}-{uuid.uuid4()}"

    qr_payload = json.dumps({
        "merchant": "STRIDERA Footwear PH",
        "wallet": wallet_label,
        "orderNumber": order.order_number,
        "amountPHP": f"{(order.grand_total_centavos / 100):.2f}",
        "reference": reference_number,
        "mode": "SANDBOX",
    })

    payment = Payment(
        order_id=order.id,
        provider=f"{payment_method}_sandbox",
        payment_method=payment_method,
        provider_payment_id=reference_number,
        idempotency_key=idempotency_key,
        amount_centavos=order.grand_total_centavos,
        currency="PHP",
        status="PENDING",
        is_demo=True,
    )
    db.add(payment)
    order.payment_status = "PENDING"
    order.payment_method = payment_method
    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "message": f"{wallet_label} Sandbox Session initialized. Scan QR or confirm payment below.",
        "data": {
            "paymentId": payment.id,
            "paymentMethod": payment_method,
            "walletLabel": wallet_label,
            "checkoutUrl": None,
            "sandboxMode": True,
            "qrCodeData": qr_payload,
            "referenceNumber": reference_number,
            "amountCentavos": order.grand_total_centavos,
            "amountFormatted": format_peso(order.grand_total_centavos),
            "status": "PENDING",
            "demoModeAvailable": _is_demo_fallback_enabled(),
        },
    }


@router.post("/confirm-sandbox")
def confirm_sandbox_payment(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    order_number = str(payload.get("orderNumber") or "").strip()
    if not order_number:
        raise HTTPException(status_code=400, detail="Order number required")

    order = db.query(Order).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.user_id and (not user or (order.user_id != user.id and user.role != "ADMIN")):
        raise HTTPException(status_code=403, detail="Access denied")

    resolved_method = str(payload.get("paymentMethod") or order.payment_method or "gcash").lower()
    wallet_label = WALLET_LABELS.get(resolved_method, "E-Wallet")
    reference_number = str(payload.get("referenceNumber") or f"SANDBOX-{uuid.uuid4().hex[:8].upper()}")

    result = finalize_payment(
        db,
        order_id=order.id,
        provider=f"{resolved_method}_sandbox",
        payment_method=resolved_method,
        reference_number=reference_number,
        actor_id=user.id if user else None,
        is_demo=True,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "success": True,
        "message": "Order was already paid (idempotent)" if result["alreadyPaid"] else f"{wallet_label} Sandbox Payment Confirmed!",
        "data": {
            "orderNumber": order.order_number,
            "paymentStatus": "PAID",
            "orderStatus": "CONFIRMED",
            "paymentMethod": resolved_method,
            "referenceNumber": result["referenceNumber"],
            "stockConflicts": result["stockConflicts"],
        },
    }


@router.post("/fail-sandbox")
def fail_sandbox_payment(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order_number = str(payload.get("orderNumber") or "").strip()
    reason = str(payload.get("reason") or "Insufficient e-wallet balance or user cancelled authorization")
    if not order_number:
        raise HTTPException(status_code=400, detail="Order number required")

    order = db.query(Order).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied")
    if order.payment_status == "PAID":
        raise HTTPException(status_code=400, detail="Order is already paid")

    db.query(Payment).filter(Payment.order_id == order.id, Payment.status == "PENDING").update({"status": "FAILED"}, synchronize_session=False)
    order.payment_status = "FAILED"
    db.add(
        AuditLog(
            user_id=user.id,
            action="EWALLET_PAYMENT_FAILED",
            entity_type="Order",
            entity_id=order.id,
            new_values={"orderNumber": order_number, "reason": reason},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()

    return {
        "success": True,
        "message": f"Payment failed: {reason}. You may retry payment using any supported e-wallet.",
        "data": {
            "orderNumber": order.order_number,
            "paymentStatus": "FAILED",
            "orderStatus": order.order_status,
        },
    }


@router.post("/simulate")
def simulate_payment(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_demo_fallback_enabled():
        raise HTTPException(
            status_code=403,
            detail="Demo fallback is disabled. Set DEMO_FALLBACK_ENABLED=true and DEMO_MODE=true to enable payment simulation.",
        )

    platform_cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    if platform_cfg and platform_cfg.sandbox_mode is False:
        raise HTTPException(status_code=403, detail="Payment simulation is only allowed in sandbox mode.")

    order_number = str(payload.get("orderNumber") or "").strip()
    if not order_number:
        raise HTTPException(status_code=400, detail="Order number required")

    order = db.query(Order).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied")

    result = finalize_payment(
        db,
        order_id=order.id,
        provider="SIMULATED",
        payment_method=order.payment_method or "gcash",
        reference_number=f"SIM-{uuid.uuid4().hex[:8].upper()}",
        actor_id=user.id,
        is_demo=True,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "success": True,
        "message": "Order already paid (idempotent)" if result["alreadyPaid"] else "SIMULATED payment — demo mode only",
        "data": {
            "orderNumber": order.order_number,
            "paymentStatus": "PAID",
            "orderStatus": "CONFIRMED",
            "isDemo": True,
            "stockConflicts": result["stockConflicts"] or [],
        },
    }


@router.get("/{payment_id}")
def get_payment_status(
    payment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = (
        db.query(Payment)
        .options(selectinload(Payment.order))
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.order.user_id != user.id and user.role not in {"ADMIN", "FINANCE_OFFICER"}:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "success": True,
        "data": {
            "id": payment.id,
            "orderNumber": payment.order.order_number,
            "provider": payment.provider,
            "paymentMethod": payment.payment_method,
            "status": payment.status,
            "amountCentavos": payment.amount_centavos,
            "amountFormatted": format_peso(payment.amount_centavos),
            "currency": payment.currency,
            "isDemo": payment.is_demo,
            "verifiedAt": to_iso_utc(payment.verified_at),
            "financeVerified": payment.finance_verified,
            "checkoutUrl": payment.provider_checkout_url,
            "createdAt": to_iso_utc(payment.created_at),
        },
    }
