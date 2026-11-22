# STRIDERA — Multi-Seller Footwear E-Commerce & 7-Role Enterprise Operations Platform

STRIDERA is a full-stack multi-seller footwear marketplace built with a **Python 3.12 + FastAPI + SQLAlchemy 2.0 ORM** back-end (`python_backend/`), **PostgreSQL** (`stridera`, 24 relational tables + 18 enums), and a **Next.js 16 (App Router)** storefront (`frontend/`), integrated with two live, zero-key public HTTPS REST APIs:

1. **PSGC Philippine Address API** (`https://psgc.gitlab.io/api`) — Live Region → Province → City/Municipality → Barangay cascading lookups & strict server-side address verification.
2. **Nager.Date Public Holidays API** (`https://date.nager.at/api/v3`) — Official Philippine public holidays calendar (`PH`) driving a Manila-timezone courier business-day delivery ETA engine (`NCR`: 2–3 business days vs `Provincial Philippines`: 4–6 business days).

---

## Project Architecture

```text
STRIDERA---Ecommerce-/
├── python_backend/                # Modular Python FastAPI Back-End (:5000)
│   ├── app/
│   │   ├── main.py                # FastAPI app, OpenAPI (/docs), CORS, error handlers, static mounts
│   │   ├── core/
│   │   │   ├── config.py          # Environment loader & normalized PostgreSQL DSN
│   │   │   ├── database.py        # SQLAlchemy 2.0 engine, SessionLocal & DB health check
│   │   │   ├── security.py        # Argon2 password hashing, PyJWT + SHA-256 session cookies, 7-role RBAC
│   │   │   ├── validators.py      # Authoritative PH mobile (+63 9XX-XXX-YYYY), email, SKU, price & stock rules
│   │   │   └── serializers.py     # CamelCase JSON serializers matching Next.js contracts
│   │   ├── models/models.py       # Complete SQLAlchemy 2.0 ORM definitions (24 tables + 18 PostgreSQL enums)
│   │   ├── services/
│   │   │   ├── psgc_client.py     # Async httpx PSGC API client with 24h TTL cache, retries & hierarchy check
│   │   │   ├── holiday_client.py  # Async httpx Nager.Date PH Holidays client & delivery ETA calculator
│   │   │   ├── payment_finalizer.py # Atomic stock verification, decrement & ledger finalization
│   │   │   └── image_upload.py    # Magic-byte PNG/JPEG/WEBP validation (max 2MB)
│   │   └── routers/               # 16 modular FastAPI routers (/api/*)
│   ├── tests/                     # Pytest unit, external API & full E2E integration tests
│   ├── init_db.py                 # Pure-Python PostgreSQL schema & config initializer
│   └── run.py                     # Uvicorn CLI runner
├── frontend/                      # Next.js 16 Storefront & 7-Role Enterprise UI (:3000)
├── database/                      # PostgreSQL schema (schema.sql), migrations & seed script
├── scripts/start-vm.sh            # Linux / VirtualBox VM one-command launcher
├── Dockerfile.backend             # Python 3.12 FastAPI container image
├── Dockerfile.frontend            # Node 20 Next.js container image
├── docker-compose.yml             # Multi-container PostgreSQL + FastAPI + Next.js orchestration
├── requirements.txt               # Pinned Python dependencies
└── API_DOCUMENTATION.md           # Full REST endpoints & payload reference
```

---

## Quick Start (Python Virtual Environment `.venv` on Localhost)

### 1. Create & Activate Python `.venv` + Install Dependencies
```powershell
# Windows PowerShell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment & Start PostgreSQL
Copy `backend/.env.example` to `backend/.env` if needed (`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stridera`).

- If using native PostgreSQL or Docker Postgres, ensure database `stridera` is running on port `5432`.
- Or use the included zero-install PGlite PostgreSQL daemon (`cd backend && node db-server.js`).

Verify/initialize schema via Python:
```powershell
python -m python_backend.init_db
```

### 3. Run Python FastAPI Back-End (`:5000`) & Next.js Front-End (`:3000`)
```powershell
# Terminal 1 — Python FastAPI API + Swagger UI
.\.venv\Scripts\python.exe -m python_backend.run

# Terminal 2 — Next.js Frontend (proxies /api/* -> http://127.0.0.1:5000/api/*)
cd frontend
npm run dev
```

*(Windows users can also double-click `start-all.bat` to launch PostgreSQL, Python FastAPI, and Next.js automatically.)*

- **Storefront UI:** http://localhost:3000
- **FastAPI Backend:** http://localhost:5000
- **Interactive Swagger API Docs:** http://localhost:5000/docs
- **ReDoc API Reference:** http://localhost:5000/redoc
- **System Health:** http://localhost:5000/api/health

---

## Virtual Machine & Containerized Setup (Docker / Linux VM)

### Option A: Docker Compose (`PostgreSQL 16` + `Python FastAPI` + `Next.js`)
```bash
docker compose up --build
```
Services expose `localhost:3000` (Next.js), `localhost:5000` (FastAPI + `/docs`), and `localhost:5432` (PostgreSQL).

### Option B: Linux Virtual Machine (VirtualBox / Ubuntu / WSL2)
```bash
chmod +x scripts/start-vm.sh
./scripts/start-vm.sh
```
The script automatically bootstraps `.venv`, installs `requirements.txt`, initializes PostgreSQL via `python_backend.init_db`, installs frontend packages if missing, and binds both services to `0.0.0.0` (`3000` and `5000`) for clean host-to-guest VM port forwarding.

---

## 7 User Roles & Dedicated Portals

| Role | Enum | Portal Route | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **1. Shopper** | `CUSTOMER` | `/`, `/shop`, `/checkout`, `/account/orders` | Browse multi-seller catalog, filter by size/color/seller/price, live PSGC PH address lookup, Holiday delivery ETA, sandbox e-wallet checkout (GCash, Maya, PayPal), confirm receipt, reviews, support tickets |
| **2. Seller** | `SELLER` | `/seller/dashboard`, `/seller/products`, `/seller/orders` | Store profile, product/SKU CRUD, validated image upload, accept & fulfill paid order slices, courier tracking, net earnings |
| **3. Administrator** | `ADMIN` | `/admin/dashboard` | Executive KPIs, 7-role user governance (with self-lockout protection), seller approval, brand governance, encrypted settings & live PSGC/Holiday health diagnostics |
| **4. Inventory Manager** | `INVENTORY_MANAGER` | `/inventory` | Warehouse SKU monitor, low-stock alerts, incoming restocks, outgoing dispatches, manual adjustments & movement audit log |
| **5. Delivery Personnel** | `DELIVERY_PERSONNEL` | `/delivery` | Courier manifest, delivery zone & holiday ETA awareness, accept assignment, confirm seller pickup, transit updates, Proof of Delivery (POD) |
| **6. Customer Support** | `CUSTOMER_SUPPORT` | `/support` | Support ticket queue, order/payment/shipment diagnostic lookup, ticket replies, cancellation/return approval & refund escalation |
| **7. Finance Officer** | `FINANCE_OFFICER` | `/finance` | Payment verification, `5%` platform commission breakdown, seller payout settlement, refund processing & financial report |

*(Seed accounts are provisioned via `database/seeds/seed.js` for evaluation; see `API_DOCUMENTATION.md` for full endpoint specs.)*

---

## Automated Testing (`pytest`)

Run the Python FastAPI unit, external API, and PostgreSQL integration test suite inside `.venv`:

```powershell
.\.venv\Scripts\pytest.exe python_backend/tests -v
```
