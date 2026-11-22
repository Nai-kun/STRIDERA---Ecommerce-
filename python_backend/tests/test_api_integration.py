"""End-to-end FastAPI integration tests against live PostgreSQL covering all 7 roles, catalog, cart, checkout & portals."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from python_backend.app.core.database import SessionLocal
from python_backend.app.main import app
from python_backend.app.models.models import (
    AuditLog,
    Order,
    OrderItem,
    Payment,
    ProductVariant,
    SellerOrder,
    StockMovement,
)

SEEDED_ACCOUNTS = [
    ("CUSTOMER", "demo@stridera.ph", "Customer@123!"),
    ("SELLER", "seller@stridera.ph", "Seller@123!"),
    ("SELLER", "sole@stridera.ph", "Seller@123!"),
    ("SELLER_PENDING", "pending.seller@stridera.ph", "Seller@123!"),
    ("ADMIN", "admin@stridera.ph", "Admin@Stridera2024!"),
    ("INVENTORY_MANAGER", "inventory@stridera.ph", "Inventory@123!"),
    ("DELIVERY_PERSONNEL", "delivery@stridera.ph", "Delivery@123!"),
    ("CUSTOMER_SUPPORT", "support@stridera.ph", "Support@123!"),
    ("FINANCE_OFFICER", "finance@stridera.ph", "Finance@123!"),
]


def _login(client: TestClient, email: str, password: str) -> tuple[str, dict[str, Any]]:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    body = res.json()
    assert body["success"] is True
    return body["data"]["token"], body["data"]["user"]


def test_system_health_and_openapi_docs(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert body["success"] is True
    assert body["database"] == "connected"
    assert "FastAPI" in body["runtime"]

    docs = client.get("/docs")
    assert docs.status_code == 200
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    assert "/api/products" in spec.json()["paths"]


@pytest.mark.parametrize("role_label,email,password", SEEDED_ACCOUNTS)
def test_all_9_seeded_accounts_login(client: TestClient, role_label: str, email: str, password: str) -> None:
    token, user = _login(client, email, password)
    assert token
    assert user["email"] == email

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["data"]["email"] == email


def test_invalid_login_returns_generic_401(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"email": "demo@stridera.ph", "password": "WrongPassword123!"})
    assert res.status_code == 401
    assert res.json()["message"] == "Invalid email or password."


def test_rbac_enforcement_across_portals(client: TestClient) -> None:
    cust_token, _ = _login(client, "demo@stridera.ph", "Customer@123!")
    cust_hdr = {"Authorization": f"Bearer {cust_token}"}

    assert client.get("/api/admin/users", headers=cust_hdr).status_code == 403
    assert client.get("/api/inventory/dashboard", headers=cust_hdr).status_code == 403
    assert client.get("/api/delivery/shipments", headers=cust_hdr).status_code == 403
    assert client.get("/api/finance/dashboard", headers=cust_hdr).status_code == 403
    assert client.get("/api/support/tickets", headers=cust_hdr).status_code == 403
    assert client.get("/api/seller/dashboard", headers=cust_hdr).status_code == 404

    pending_token, _ = _login(client, "pending.seller@stridera.ph", "Seller@123!")
    assert client.get("/api/seller/dashboard", headers={"Authorization": f"Bearer {pending_token}"}).status_code == 403


def test_catalog_categories_brands_and_filters(client: TestClient) -> None:
    prods = client.get("/api/products?limit=6")
    assert prods.status_code == 200
    plist = prods.json()["data"]["products"]
    assert len(plist) >= 1

    featured = client.get("/api/products/featured")
    assert featured.status_code == 200
    assert len(featured.json()["data"]) >= 1

    filters = client.get("/api/products/filters")
    assert filters.status_code == 200
    assert len(filters.json()["data"]["categories"]) >= 1

    slug = plist[0]["slug"]
    detail = client.get(f"/api/products/{slug}")
    assert detail.status_code == 200
    assert detail.json()["data"]["slug"] == slug

    assert client.get("/api/categories").status_code == 200
    assert client.get("/api/brands").status_code == 200


def test_cart_edge_cases_and_checkout_payment_restore_flow() -> None:
    with TestClient(app) as shopper:
        token, _ = _login(shopper, "demo@stridera.ph", "Customer@123!")
        hdr = {"Authorization": f"Bearer {token}"}

        # Ensure clean cart before test
        shopper.delete("/api/cart", headers=hdr)

        # Empty cart checkout must fail with 400
        empty_checkout = shopper.post(
            "/api/orders",
            headers=hdr,
            json={
                "shippingAddress": {
                    "fullName": "Juan Dela Cruz",
                    "phone": "09171234567",
                    "addressLine1": "123 Ayala Avenue",
                    "city": "City of Makati",
                    "province": "Metro Manila",
                    "postalCode": "1229",
                }
            },
        )
        assert empty_checkout.status_code == 400
        assert "empty" in empty_checkout.json()["message"].lower()

        # Find an in-stock active variant
        prods = shopper.get("/api/products?inStock=true&limit=5").json()["data"]["products"]
        slug = prods[0]["slug"]
        detail = shopper.get(f"/api/products/{slug}").json()["data"]
        variant = next(v for v in detail["variants"] if v["stockQuantity"] >= 2)
        variant_id = variant["id"]
        orig_stock = variant["stockQuantity"]

        # Exceeding live stock must be rejected
        too_many = shopper.post(
            "/api/cart/items",
            headers=hdr,
            json={"productVariantId": variant_id, "quantity": orig_stock + 50},
        )
        assert too_many.status_code == 400

        # Add 1 unit cleanly
        added = shopper.post(
            "/api/cart/items",
            headers=hdr,
            json={"productVariantId": variant_id, "quantity": 1},
        )
        assert added.status_code == 201
        cart_data = added.json()["data"]
        assert cart_data["itemCount"] == 1

        # Create order with manual fallback address + server-side Holiday ETA
        order_res = shopper.post(
            "/api/orders",
            headers=hdr,
            json={
                "paymentMethod": "gcash",
                "shippingAddress": {
                    "fullName": "Juan Dela Cruz",
                    "phone": "09171234567",
                    "addressLine1": "123 Ayala Avenue, Legazpi Village",
                    "city": "City of Makati",
                    "province": "Metro Manila",
                    "postalCode": "1229",
                    "addressSource": "MANUAL_FALLBACK",
                },
            },
        )
        assert order_res.status_code == 201, order_res.text
        order_data = order_res.json()["data"]
        order_num = order_data["orderNumber"]
        order_id = order_data["id"]
        assert order_data["shippingPhone"] == "+63 917-123-4567"
        assert order_data["deliveryZone"] == "NCR"
        assert order_data["estimatedDeliveryStart"] is not None

        try:
            # Initialize & confirm E-Wallet sandbox payment (decrements stock atomically)
            sess_res = shopper.post(
                "/api/payments/create-session",
                headers=hdr,
                json={"orderNumber": order_num, "paymentMethod": "gcash"},
            )
            assert sess_res.status_code == 200
            ref_num = sess_res.json()["data"]["referenceNumber"]

            conf_res = shopper.post(
                "/api/payments/confirm-sandbox",
                headers=hdr,
                json={"orderNumber": order_num, "paymentMethod": "gcash", "referenceNumber": ref_num},
            )
            assert conf_res.status_code == 200
            assert conf_res.json()["data"]["paymentStatus"] == "PAID"

            # Cancel order to verify stock restoration back to orig_stock
            cancel_res = shopper.patch(f"/api/orders/{order_num}/cancel", headers=hdr)
            assert cancel_res.status_code == 200

            db = SessionLocal()
            try:
                v_after = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
                assert v_after is not None and v_after.stock_quantity == orig_stock
            finally:
                db.close()
        finally:
            # Clean up synthetic test order records from PostgreSQL
            db = SessionLocal()
            try:
                db.query(StockMovement).filter(StockMovement.reference_id == order_num).delete(synchronize_session=False)
                db.query(AuditLog).filter(AuditLog.entity_id == order_id).delete(synchronize_session=False)
                db.query(Payment).filter(Payment.order_id == order_id).delete(synchronize_session=False)
                db.query(OrderItem).filter(OrderItem.order_id == order_id).delete(synchronize_session=False)
                db.query(SellerOrder).filter(SellerOrder.order_id == order_id).delete(synchronize_session=False)
                db.query(Order).filter(Order.id == order_id).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()


def test_all_enterprise_portals_accessible_to_respective_roles(client: TestClient) -> None:
    checks = [
        ("seller@stridera.ph", "Seller@123!", ["/api/seller/dashboard", "/api/seller/metrics", "/api/seller/products", "/api/seller/orders"]),
        ("inventory@stridera.ph", "Inventory@123!", ["/api/inventory/dashboard", "/api/inventory/variants", "/api/inventory/movements", "/api/inventory/report"]),
        ("delivery@stridera.ph", "Delivery@123!", ["/api/delivery/shipments"]),
        ("support@stridera.ph", "Support@123!", ["/api/support/tickets", "/api/support/orders/lookup?q=STR"]),
        ("finance@stridera.ph", "Finance@123!", ["/api/finance/dashboard", "/api/finance/reports"]),
        ("admin@stridera.ph", "Admin@Stridera2024!", ["/api/admin/users", "/api/admin/analytics", "/api/admin/config-status", "/api/admin/platform-config", "/api/admin/api-settings", "/api/admin/health"]),
    ]
    for email, pw, paths in checks:
        token, _ = _login(client, email, pw)
        hdr = {"Authorization": f"Bearer {token}"}
        for p in paths:
            res = client.get(p, headers=hdr)
            assert res.status_code == 200, f"{email} GET {p} failed: {res.status_code} {res.text}"
            assert res.json()["success"] is True


def test_location_and_schedule_api_endpoints(client: TestClient) -> None:
    assert client.get("/api/locations/regions").status_code == 200
    assert client.get("/api/schedule/holidays?year=2026").status_code == 200
    est = client.get("/api/schedule/delivery-estimate?regionCode=130000000&city=Manila")
    assert est.status_code == 200
    assert est.json()["data"]["zone"] == "NCR"


def test_inventory_incoming_outgoing_round_trip(client: TestClient) -> None:
    token, user = _login(client, "inventory@stridera.ph", "Inventory@123!")
    hdr = {"Authorization": f"Bearer {token}"}
    variants = client.get("/api/inventory/variants", headers=hdr)
    assert variants.status_code == 200
    v_list = variants.json()["data"]
    assert len(v_list) >= 1

    target = v_list[0]
    vid = target["id"]
    orig_stock = target["stockQuantity"]
    ref_tag = f"TEST-INV-{uuid.uuid4().hex[:8].upper()}"

    try:
        inc = client.post(
            "/api/inventory/incoming",
            headers=hdr,
            json={"variantId": vid, "quantity": 1, "reason": "Pytest round-trip restock", "referenceId": ref_tag},
        )
        assert inc.status_code == 200, inc.text
        assert inc.json()["data"]["stockQuantity"] == orig_stock + 1

        out = client.post(
            "/api/inventory/outgoing",
            headers=hdr,
            json={"variantId": vid, "quantity": 1, "reason": "Pytest round-trip dispatch", "referenceId": ref_tag},
        )
        assert out.status_code == 200, out.text
        assert out.json()["data"]["stockQuantity"] == orig_stock
    finally:
        db = SessionLocal()
        try:
            db.query(StockMovement).filter(StockMovement.reference_id == ref_tag).delete(synchronize_session=False)
            db.query(AuditLog).filter(
                AuditLog.entity_id == vid,
                AuditLog.user_id == user["id"],
                AuditLog.action.in_(["INVENTORY_INCOMING_STOCK", "INVENTORY_OUTGOING_STOCK"]),
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
