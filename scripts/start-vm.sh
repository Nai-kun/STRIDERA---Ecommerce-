#!/usr/bin/env bash
# ==============================================================================
# STRIDERA Linux Virtual Machine / Containerized Localhost Launcher
# Usage: chmod +x scripts/start-vm.sh && ./scripts/start-vm.sh
# ==============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "============================================================"
echo "  STRIDERA - Python FastAPI + PostgreSQL + Next.js Stack"
echo "============================================================"

# 1. Create and activate isolated Python virtual environment (.venv)
if [ ! -d ".venv" ]; then
  echo "[1/5] Creating Python virtual environment (.venv)..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[2/5] Installing Python dependencies from requirements.txt..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

# 2. Ensure backend/.env exists
if [ ! -f "backend/.env" ] && [ -f "backend/.env.example" ]; then
  echo "[INFO] Copying backend/.env.example -> backend/.env"
  cp backend/.env.example backend/.env
fi

# 3. Verify PostgreSQL connection & initialize schema via Python SQLAlchemy
echo "[3/5] Verifying PostgreSQL & initializing schema via python_backend.init_db..."
python -m python_backend.init_db

# 4. Install Next.js frontend packages if needed
if [ ! -d "frontend/node_modules" ]; then
  echo "[4/5] Installing Next.js frontend dependencies..."
  (cd frontend && npm install)
else
  echo "[4/5] Next.js dependencies already present."
fi

# 5. Start Python FastAPI (:5000) and Next.js (:3000) bound to 0.0.0.0 for VM port forwarding
echo "[5/5] Starting FastAPI Back-End on 0.0.0.0:5000 and Next.js on 0.0.0.0:3000..."

cleanup() {
  echo ""
  echo "Stopping STRIDERA services..."
  kill "${BACK_PID:-}" "${FRONT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python -m python_backend.run &
BACK_PID=$!

(cd frontend && npm run dev -- -H 0.0.0.0 -p 3000) &
FRONT_PID=$!

echo ""
echo "STRIDERA VM Services Running:"
echo "  - Storefront UI:   http://localhost:3000"
echo "  - FastAPI Backend: http://localhost:5000"
echo "  - Swagger Docs:    http://localhost:5000/docs"
echo "Press Ctrl+C to stop both services."

wait "$BACK_PID" "$FRONT_PID"
