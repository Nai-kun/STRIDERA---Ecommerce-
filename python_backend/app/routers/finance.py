"""Financial Management Portal routes (/api/finance/*)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..core.database import get_db
from ..core.security import require_finance, utcnow_naive
from ..core.serializers import format_peso, serialize_payment, to_iso_utc
from ..models.models import (
    AuditLog,
    Order,
    Payment,
    PlatformConfig,
    SellerOrder,
    SellerPayout,
    SupportTicket,
    User,
)

router = APIRouter(prefix="/api/finance", tags=["Finance"])


@router.get("/dashboard")
def finance_dashboard(
    user: User = Depends(require_finance),
    db: Session = Depends(get_db),
):
    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    fee_percent = cfg.platform_fee_percent if cfg else 5

    payments = (
        db.query(Payment)
        .options(selectinload(Payment.order).selectinload(Order.user))
        .order_by(Payment.created_at.desc())
        .limit(50)
        .all()
    )
    paid_orders_count = db.query(func.count(Order.id)).filter(Order.payment_status == "PAID").scalar() or 0
    total_gross = db.query(func.sum(Order.grand_total_centavos)).filter(Order.payment_status == "PAID").scalar() or 0
    total_gross = int(total_gross)

    payouts = (
        db.query(SellerPayout)
        .options(selectinload(SellerPayout.seller), selectinload(SellerPayout.processed_by))
        .order_by(SellerPayout.created_at.desc())
        .limit(30)
        .all()
    )

    refund_tickets = (
        db.query(SupportTicket)
        .options(
            selectinload(SupportTicket.user),
            selectinload(SupportTicket.order),
        )
        .filter(SupportTicket.refund_status != "NONE")
        .order_by(SupportTicket.created_at.desc())
        .all()
    )

    sellers = (
        db.query(User)
        .filter(User.role == "SELLER", User.seller_status == "APPROVED")
        .all()
    )

    seller_earnings = []
    for s in sellers:
        s_gross = (
            db.query(func.sum(SellerOrder.subtotal_centavos))
            .join(Order, SellerOrder.order_id == Order.id)
            .filter(
                SellerOrder.seller_id == s.id,
                Order.payment_status == "PAID",
                SellerOrder.status != "CANCELLED",
            )
            .scalar()
        )
        gross_c = int(s_gross or 0)
        fee_c = (gross_c * fee_percent) // 100
        net_earned = gross_c - fee_c
        paid_out = (
            db.query(func.sum(SellerPayout.net_amount_centavos))
            .filter(SellerPayout.seller_id == s.id)
            .scalar()
        )
        paid_out_c = int(paid_out or 0)
        balance_c = max(0, net_earned - paid_out_c)
        seller_earnings.append({
            "sellerId": s.id,
            "storeName": s.store_name or f"{s.first_name} {s.last_name}",
            "email": s.email,
            "grossSalesCentavos": gross_c,
            "platformFeeCentavos": fee_c,
            "netEarnedCentavos": net_earned,
            "alreadyPaidCentavos": paid_out_c,
            "availableBalanceCentavos": balance_c,
            "availableBalanceFormatted": format_peso(balance_c),
        })

    unverified_count = sum(1 for p in payments if p.status == "PAID" and not p.finance_verified)
    pending_refunds_count = sum(1 for t in refund_tickets if t.refund_status in {"PENDING", "APPROVED"})
    platform_commission = (total_gross * fee_percent) // 100

    serialized_payments = []
    for p in payments:
        row = serialize_payment(p)
        row["order"] = {
            "orderNumber": p.order.order_number,
            "orderStatus": p.order.order_status,
            "paymentStatus": p.order.payment_status,
            "grandTotalCentavos": p.order.grand_total_centavos,
            "shippingFullName": p.order.shipping_full_name,
            "user": {"email": p.order.user.email} if p.order.user else None,
        } if p.order else None
        serialized_payments.append(row)

    serialized_payouts = [
        {
            "id": po.id,
            "payoutNumber": po.payout_number,
            "sellerId": po.seller_id,
            "grossSalesCentavos": po.gross_sales_centavos,
            "platformFeePercent": po.platform_fee_percent,
            "platformFeeCentavos": po.platform_fee_centavos,
            "netAmountCentavos": po.net_amount_centavos,
            "netAmountFormatted": format_peso(po.net_amount_centavos),
            "provider": po.provider,
            "referenceNumber": po.reference_number,
            "status": po.status,
            "notes": po.notes,
            "createdAt": to_iso_utc(po.created_at),
            "seller": {"storeName": po.seller.store_name, "email": po.seller.email} if po.seller else None,
            "processedBy": {"firstName": po.processed_by.first_name, "lastName": po.processed_by.last_name} if po.processed_by else None,
        }
        for po in payouts
    ]

    serialized_refunds = [
        {
            "id": t.id,
            "ticketNumber": t.ticket_number,
            "category": t.category,
            "subject": t.subject,
            "status": t.status,
            "refundStatus": t.refund_status,
            "refundAmountCentavos": t.refund_amount_centavos,
            "createdAt": to_iso_utc(t.created_at),
            "user": {"firstName": t.user.first_name, "lastName": t.user.last_name, "email": t.user.email} if t.user else None,
            "order": {
                "orderNumber": t.order.order_number,
                "grandTotalCentavos": t.order.grand_total_centavos,
                "paymentMethod": t.order.payment_method,
            } if t.order else None,
        }
        for t in refund_tickets
    ]

    return {
        "success": True,
        "data": {
            "summary": {
                "totalGrossRevenueCentavos": total_gross,
                "totalGrossRevenueFormatted": format_peso(total_gross),
                "platformCommissionCentavos": platform_commission,
                "platformCommissionFormatted": format_peso(platform_commission),
                "platformFeePercent": fee_percent,
                "paidOrdersCount": paid_orders_count,
                "unverifiedPaymentsCount": unverified_count,
                "pendingRefundsCount": pending_refunds_count,
            },
            "payments": serialized_payments,
            "payouts": serialized_payouts,
            "refundTickets": serialized_refunds,
            "sellerEarnings": seller_earnings,
        },
    }


@router.patch("/payments/{payment_id}/verify")
def verify_payment(
    payment_id: str,
    request: Request,
    user: User = Depends(require_finance),
    db: Session = Depends(get_db),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    now = utcnow_naive()
    payment.finance_verified = True
    payment.finance_verified_by = f"{user.first_name} {user.last_name}"
    payment.finance_verified_at = now
    db.add(
        AuditLog(
            user_id=user.id,
            action="FINANCE_VERIFY_PAYMENT",
            entity_type="Payment",
            entity_id=payment.id,
            new_values={"financeVerified": True, "amountCentavos": payment.amount_centavos},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(payment)
    return {"success": True, "message": "Payment transaction verified by Finance.", "data": serialize_payment(payment)}


@router.post("/payouts")
def process_payout(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_finance),
    db: Session = Depends(get_db),
):
    seller_id = str(payload.get("sellerId") or "").strip()
    try:
        amount_c = int(payload.get("amountCentavos"))
    except (TypeError, ValueError):
        amount_c = 0
    if not seller_id or amount_c < 100:
        raise HTTPException(status_code=400, detail="Valid seller ID and payout amount (at least 100 centavos) required.")

    seller = db.query(User).filter(User.id == seller_id, User.role == "SELLER").first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    fee_percent = cfg.platform_fee_percent if cfg else 5
    fee_c = (amount_c * fee_percent) // 100
    net_c = amount_c - fee_c
    provider = str(payload.get("provider") or "gcash").lower()
    if provider not in {"gcash", "maya", "paypal"}:
        provider = "gcash"
    payout_number = f"PO-{utcnow_naive().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    reference_number = str(payload.get("referenceNumber") or f"SIM-PO-{uuid.uuid4().hex[:8].upper()}")
    is_sim = payload.get("isSimulated") is not False

    payout = SellerPayout(
        payout_number=payout_number,
        seller_id=seller_id,
        gross_sales_centavos=amount_c,
        platform_fee_percent=fee_percent,
        platform_fee_centavos=fee_c,
        net_amount_centavos=net_c,
        provider=provider,
        reference_number=reference_number,
        status="SIMULATED" if is_sim else "COMPLETED",
        processed_by_id=user.id,
        notes=payload.get("notes") or f"E-Wallet Seller Payout via {provider.upper()}",
    )
    db.add(payout)
    db.flush()
    db.add(
        AuditLog(
            user_id=user.id,
            action="FINANCE_PROCESS_PAYOUT",
            entity_type="SellerPayout",
            entity_id=payout.id,
            new_values={"payoutNumber": payout_number, "sellerId": seller_id, "netAmountCentavos": net_c, "provider": provider},
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(payout)

    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "message": f"Payout {payout_number} ({format_peso(net_c)}) processed to {seller.store_name or seller.email}.",
            "data": {
                "id": payout.id,
                "payoutNumber": payout.payout_number,
                "sellerId": payout.seller_id,
                "grossSalesCentavos": payout.gross_sales_centavos,
                "platformFeePercent": payout.platform_fee_percent,
                "platformFeeCentavos": payout.platform_fee_centavos,
                "netAmountCentavos": payout.net_amount_centavos,
                "netAmountFormatted": format_peso(payout.net_amount_centavos),
                "provider": payout.provider,
                "referenceNumber": payout.reference_number,
                "status": payout.status,
                "notes": payout.notes,
                "createdAt": to_iso_utc(payout.created_at),
            },
        },
    )


@router.post("/refunds/{ticket_id}/process")
def process_refund(
    ticket_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(require_finance),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(SupportTicket)
        .options(selectinload(SupportTicket.order).selectinload(Order.payments))
        .filter(SupportTicket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.refund_status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Refund already completed for this ticket")

    notes = payload.get("notes")
    ticket.refund_status = "COMPLETED"
    ticket.status = "RESOLVED"
    ticket.resolution_notes = notes or f"Refund completed by Finance ({user.first_name} {user.last_name})"

    if ticket.order_id:
        order = ticket.order
        if order:
            order.payment_status = "REFUNDED"
            db.query(Payment).filter(Payment.order_id == order.id, Payment.status == "PAID").update(
                {"status": "REFUNDED"}, synchronize_session=False
            )

    db.add(
        AuditLog(
            user_id=user.id,
            action="FINANCE_COMPLETE_REFUND",
            entity_type="SupportTicket",
            entity_id=ticket.id,
            new_values={
                "ticketNumber": ticket.ticket_number,
                "orderId": ticket.order_id,
                "refundAmountCentavos": ticket.refund_amount_centavos,
            },
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()

    return {"success": True, "message": f"Refund for ticket {ticket.ticket_number} completed."}


@router.get("/reports")
def finance_reports(
    period: str = Query(default="all"),
    user: User = Depends(require_finance),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).filter(Order.payment_status.in_(["PAID", "REFUNDED"])).order_by(Order.created_at.desc()).all()
    payouts = db.query(SellerPayout).all()
    cfg = db.query(PlatformConfig).filter(PlatformConfig.id == "default").first()
    fee_percent = cfg.platform_fee_percent if cfg else 5

    paid_orders = [o for o in orders if o.payment_status == "PAID"]
    refunded_orders = [o for o in orders if o.payment_status == "REFUNDED"]

    gross_c = sum(o.grand_total_centavos for o in paid_orders)
    refunded_c = sum(o.grand_total_centavos for o in refunded_orders)
    commission_c = (gross_c * fee_percent) // 100
    payouts_total_c = sum(p.net_amount_centavos for p in payouts)

    method_breakdown: dict[str, dict[str, int]] = {}
    for o in paid_orders:
        m = (o.payment_method or "gcash").upper()
        slot = method_breakdown.setdefault(m, {"count": 0, "totalCentavos": 0})
        slot["count"] += 1
        slot["totalCentavos"] += o.grand_total_centavos

    return {
        "success": True,
        "data": {
            "generatedAt": to_iso_utc(utcnow_naive()),
            "period": period,
            "grossRevenueCentavos": gross_c,
            "grossRevenueFormatted": format_peso(gross_c),
            "totalRefundedCentavos": refunded_c,
            "totalRefundedFormatted": format_peso(refunded_c),
            "platformCommissionCentavos": commission_c,
            "platformCommissionFormatted": format_peso(commission_c),
            "totalPayoutsDisbursedCentavos": payouts_total_c,
            "totalPayoutsDisbursedFormatted": format_peso(payouts_total_c),
            "methodBreakdown": method_breakdown,
            "transactionCount": len(paid_orders),
        },
    }
