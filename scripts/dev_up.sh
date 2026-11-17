#!/usr/bin/env bash
# ============================================================================
# Lost & Found Campus — one-command local startup
#
#   ./scripts/dev_up.sh            # install anything missing, then serve
#   ./scripts/dev_up.sh --reset    # also wipe + reseed demo data
#   ./scripts/dev_up.sh --api-only # skip the frontend build (API on :8000)
#
# Serves the FastAPI backend AND the compiled React app from the same origin:
#   http://localhost:8000
#
# Safe to re-run: every step checks before it acts.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORT="${PORT:-8000}"
RESET=0
API_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --api-only) API_ONLY=1 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }

# --- 1. Python dependencies -------------------------------------------------
say "Checking Python dependencies"
if ! python3 -c "import fastapi, pymysql, qrcode, PIL, jose, multipart" >/dev/null 2>&1; then
  python3 -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  python3 -m pip install --quiet -r "$BACKEND/requirements.txt"
  say "Python dependencies installed"
else
  echo "already satisfied"
fi

# --- 2. MySQL / MariaDB -----------------------------------------------------
say "Checking MySQL server"
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server >/dev/null
    say "MariaDB installed"
  else
    warn "MySQL/MariaDB is not installed and apt-get is unavailable — install it manually."
    exit 1
  fi
fi
if ! (sudo mysqladmin ping >/dev/null 2>&1 || mysqladmin ping >/dev/null 2>&1); then
  sudo service mariadb start >/dev/null 2>&1 || sudo service mysql start >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    sudo mysqladmin ping >/dev/null 2>&1 && break
    sleep 1
  done
fi
sudo mysqladmin ping >/dev/null 2>&1 || { warn "Could not start MySQL."; exit 1; }
echo "server reachable"

# --- 3. Database, user, schema ---------------------------------------------
# Credentials come from backend/.env so there is a single source of truth.
envval() { grep -E "^$1=" "$BACKEND/.env" | head -1 | cut -d= -f2-; }
DB_NAME="$(envval DB_NAME)"; DB_USER="$(envval DB_USER)"
DB_PASS="$(envval DB_PASSWORD)"; DB_HOST="$(envval DB_HOST)"
DB_HOST="${DB_HOST:-127.0.0.1}"

say "Preparing database role and schema"
sudo mysql -e "
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;"

TABLE_COUNT="$(sudo mysql -N -B -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_type='BASE TABLE';" 2>/dev/null || echo 0)"
if [ "${TABLE_COUNT:-0}" -lt 22 ]; then
  sudo mysql < "$ROOT/database/schema.sql"
  say "Schema applied"
else
  echo "schema already present ($TABLE_COUNT tables)"
fi

REPORT_COUNT="$(sudo mysql -N -B "$DB_NAME" -e "SELECT COUNT(*) FROM reports;" 2>/dev/null || echo 0)"
if [ "$RESET" -eq 1 ] || [ "${REPORT_COUNT:-0}" -eq 0 ]; then
  ( cd "$BACKEND" && python3 scripts/seed_demo.py --reset >/dev/null )
  say "Demo data loaded"
else
  echo "demo data already present ($REPORT_COUNT reports)"
fi

mkdir -p "$BACKEND"/uploads/{reports,private_documents,claims,qr,branding,receipts} "$BACKEND/logs"

# --- 4. Frontend build ------------------------------------------------------
if [ "$API_ONLY" -eq 0 ]; then
  say "Building the React frontend"
  if [ ! -d "$FRONTEND/node_modules" ]; then
    ( cd "$FRONTEND" && npm install --no-audit --no-fund --silent )
  fi
  ( cd "$FRONTEND" && npm run build --silent >/dev/null )
  say "Frontend built into frontend/dist"
fi

# --- 5. Serve ---------------------------------------------------------------
say "Starting the app on http://localhost:${PORT}"
cat <<BANNER

  Local URL     http://localhost:${PORT}
  API docs      http://localhost:${PORT}/api/docs
  Health        http://localhost:${PORT}/api/health

  Demo sign-in  admin@alderton.edu / Campus#2026      (university admin)
                student@alderton.edu / Campus#2026    (student)
                security@alderton.edu / Campus#2026   (custody desk)

  Press Ctrl+C to stop.

BANNER

cd "$BACKEND"
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
