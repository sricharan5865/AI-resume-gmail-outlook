#!/bin/bash
# ============================================================
# TalentFlow - Linux Permission & Startup Setup Script
# Full audit of all directories and files the server touches.
# Run this ONCE on your Linux machine before starting.
# Usage: bash start-linux.sh
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ok()   { echo -e "${GREEN}[OK]${NC}    $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
info() { echo -e "${BLUE}[INFO]${NC}  $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Get script directory (project root) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
CLIENT_DIR="$SCRIPT_DIR/client"

echo ""
echo "=============================================="
echo "  TalentFlow - Linux Setup & Startup"
echo "  Project root: $SCRIPT_DIR"
echo "=============================================="
echo ""

# ============================================================
# STEP 1: Detect machine IP
# ============================================================
info "Detecting machine IP..."
LINUX_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "localhost")
ok "Detected IP: $LINUX_IP"
echo ""

# ============================================================
# STEP 2: Node.js version check
# ============================================================
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node.js 18+: https://nodejs.org/"
  exit 1
fi
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ required. Current: $(node --version). Please upgrade."
  exit 1
fi
ok "Node.js $(node --version)"

# ============================================================
# STEP 3: Fix directory permissions
# ============================================================
info "Setting up directories and permissions..."

# server/uploads/ — server writes PDFs here on upload
mkdir -p "$SERVER_DIR/uploads"
chmod 755 "$SERVER_DIR/uploads"
ok "server/uploads/ → 755 (read/write for uploads)"

# server/data/ — pdfkit reads font .afm and .icc files from here
if [ -d "$SERVER_DIR/data" ]; then
  chmod -R 755 "$SERVER_DIR/data"
  ok "server/data/ → 755 (read for pdfkit fonts)"
fi

# server/__pycache__/ — Python bytecode cache (if OCR is used)
if [ -d "$SERVER_DIR/__pycache__" ]; then
  chmod -R 755 "$SERVER_DIR/__pycache__"
  ok "server/__pycache__/ → 755"
fi

# /tmp — parser.js writes temp OCR files here (os.tmpdir())
# /tmp is world-writable on Linux by default, but verify
if [ -w "/tmp" ]; then
  ok "/tmp → writable (used for temp OCR files)"
else
  warn "/tmp is not writable. OCR fallback may fail."
fi

# ============================================================
# STEP 4: Fix file permissions
# ============================================================
info "Setting up file permissions..."

# server/tokens.json — OAuth tokens stored here by Outlook/Gmail
if [ ! -f "$SERVER_DIR/tokens.json" ]; then
  echo "{}" > "$SERVER_DIR/tokens.json"
  ok "server/tokens.json → created"
fi
chmod 664 "$SERVER_DIR/tokens.json"
ok "server/tokens.json → 664 (read/write for OAuth)"

# server/db.json — legacy migration file (read-only is fine)
if [ -f "$SERVER_DIR/db.json" ]; then
  chmod 644 "$SERVER_DIR/db.json"
  ok "server/db.json → 644"
fi

# server/ocr_fallback.py — Python OCR script (must be executable)
if [ -f "$SERVER_DIR/ocr_fallback.py" ]; then
  chmod 755 "$SERVER_DIR/ocr_fallback.py"
  ok "server/ocr_fallback.py → 755 (executable for OCR)"
fi

# server/.env — environment config
if [ -f "$SERVER_DIR/.env" ]; then
  chmod 600 "$SERVER_DIR/.env"
  ok "server/.env → 600 (private)"
fi

# client/.env — environment config
if [ -f "$CLIENT_DIR/.env" ]; then
  chmod 600 "$CLIENT_DIR/.env"
  ok "client/.env → 600 (private)"
fi

# server/uploads/.gitkeep — ensure it exists
touch "$SERVER_DIR/uploads/.gitkeep"

echo ""

# ============================================================
# STEP 5: Setup server .env if not exists
# ============================================================
info "Checking server/.env..."
if [ ! -f "$SERVER_DIR/.env" ]; then
  if [ -f "$SERVER_DIR/.env.example" ]; then
    cp "$SERVER_DIR/.env.example" "$SERVER_DIR/.env"
    # Auto-set FRONTEND_URL to detected IP
    sed -i "s|FRONTEND_URL=http://localhost:5173|FRONTEND_URL=http://$LINUX_IP:5173|g" "$SERVER_DIR/.env"
    chmod 600 "$SERVER_DIR/.env"
    ok "server/.env created from template (FRONTEND_URL=http://$LINUX_IP:5173)"
    warn "Review server/.env and update MONGO_URI / JWT_SECRET if needed."
  else
    warn "server/.env.example not found. Creating minimal .env..."
    cat > "$SERVER_DIR/.env" << EOF
PORT=5000
FRONTEND_URL=http://$LINUX_IP:5173
MONGO_URI=mongodb://admin:password@localhost:27017/talentflow?authSource=admin
JWT_SECRET=talentflow-super-secret-key
EOF
    chmod 600 "$SERVER_DIR/.env"
    ok "server/.env created with defaults."
  fi
else
  ok "server/.env already exists."
  # Update FRONTEND_URL if it still points to localhost
  if grep -q "FRONTEND_URL=http://localhost:5173" "$SERVER_DIR/.env"; then
    sed -i "s|FRONTEND_URL=http://localhost:5173|FRONTEND_URL=http://$LINUX_IP:5173|g" "$SERVER_DIR/.env"
    ok "server/.env → Updated FRONTEND_URL to http://$LINUX_IP:5173"
  fi
fi

# ============================================================
# STEP 6: Setup client .env if not exists
# ============================================================
info "Checking client/.env..."
if [ ! -f "$CLIENT_DIR/.env" ]; then
  if [ -f "$CLIENT_DIR/.env.example" ]; then
    cp "$CLIENT_DIR/.env.example" "$CLIENT_DIR/.env"
    chmod 600 "$CLIENT_DIR/.env"
    ok "client/.env created from template (Vite proxy handles routing)."
  else
    echo "VITE_BACKEND_URL=" > "$CLIENT_DIR/.env"
    chmod 600 "$CLIENT_DIR/.env"
    ok "client/.env created with empty VITE_BACKEND_URL (Vite proxy active)."
  fi
else
  ok "client/.env already exists."
fi

echo ""

# ============================================================
# STEP 7: Check MongoDB connectivity
# ============================================================
info "Checking MongoDB..."
MONGO_URI=$(grep "^MONGO_URI=" "$SERVER_DIR/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
MONGO_HOST=$(echo "$MONGO_URI" | sed 's|.*@||' | cut -d'/' -f1 | cut -d':' -f1)
MONGO_PORT=$(echo "$MONGO_URI" | sed 's|.*@||' | cut -d'/' -f1 | cut -d':' -f2)
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_HOST=${MONGO_HOST:-localhost}

if command -v nc &>/dev/null; then
  if nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null; then
    ok "MongoDB reachable at $MONGO_HOST:$MONGO_PORT"
  else
    warn "MongoDB NOT reachable at $MONGO_HOST:$MONGO_PORT"
    warn "Start MongoDB: sudo systemctl start mongod"
    warn "Or update MONGO_URI in server/.env"
  fi
else
  warn "netcat (nc) not installed — skipping MongoDB check. Install: sudo apt install netcat"
fi

# ============================================================
# STEP 8: Check Python (for OCR fallback)
# ============================================================
info "Checking Python (for OCR fallback)..."
if command -v python3 &>/dev/null; then
  ok "python3 found: $(python3 --version 2>&1)"
  # Symlink python -> python3 if missing (common Linux issue)
  if ! command -v python &>/dev/null; then
    warn "'python' command not found (only python3). Creating symlink..."
    PYTHON3_PATH=$(which python3)
    PYTHON_DIR=$(dirname "$PYTHON3_PATH")
    if [ -w "$PYTHON_DIR" ]; then
      ln -sf "$PYTHON3_PATH" "$PYTHON_DIR/python"
      ok "Symlink created: python -> python3"
    else
      warn "Cannot create symlink (no write access to $PYTHON_DIR)."
      warn "Run: sudo ln -sf $(which python3) /usr/local/bin/python"
      warn "(OCR fallback for images will fail without this — PDFs will still work)"
    fi
  else
    ok "python command available: $(python --version 2>&1)"
  fi
elif command -v python &>/dev/null; then
  ok "python found: $(python --version 2>&1)"
else
  warn "Python not found. OCR fallback for images won't work."
  warn "Install: sudo apt install python3"
fi

echo ""

# ============================================================
# STEP 9: Install dependencies
# ============================================================
info "Installing server dependencies..."
cd "$SERVER_DIR" && npm install --silent 2>/dev/null && ok "Server dependencies installed." || warn "Server npm install had warnings."
chmod -R +x "$SERVER_DIR/node_modules/.bin" 2>/dev/null || true
cd "$SCRIPT_DIR"

info "Installing client dependencies..."
cd "$CLIENT_DIR" && npm install --silent 2>/dev/null && ok "Client dependencies installed." || warn "Client npm install had warnings."
chmod -R +x "$CLIENT_DIR/node_modules/.bin" 2>/dev/null || true
# Explicitly fix vite binary permissions (files transferred from Windows may lose execute bits)
if [ -f "$CLIENT_DIR/node_modules/vite/bin/vite.js" ]; then
  chmod +x "$CLIENT_DIR/node_modules/vite/bin/vite.js" 2>/dev/null || true
  ok "vite binary permissions fixed."
fi
cd "$SCRIPT_DIR"

echo ""

# ============================================================
# STEP 10: Check ports are free
# ============================================================
info "Checking ports..."
for PORT in 5000 5173; do
  if command -v lsof &>/dev/null; then
    if lsof -i :"$PORT" &>/dev/null 2>&1; then
      warn "Port $PORT is already in use. Kill existing process or change port."
    else
      ok "Port $PORT is free."
    fi
  else
    ok "Port $PORT: (lsof not available — skipping check)"
  fi
done

echo ""

# ============================================================
# STEP 11: Check firewall
# ============================================================
info "Checking firewall..."
if command -v ufw &>/dev/null; then
  UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1 || echo "unknown")
  if echo "$UFW_STATUS" | grep -q "active"; then
    warn "UFW firewall is active. Ensuring ports 5000 and 5173 are open..."
    sudo ufw allow 5000/tcp 2>/dev/null && ok "Port 5000 allowed in UFW."
    sudo ufw allow 5173/tcp 2>/dev/null && ok "Port 5173 allowed in UFW."
  else
    ok "UFW firewall: inactive (no action needed)"
  fi
else
  ok "UFW not installed (no action needed)"
fi

echo ""

# ============================================================
# STEP 12: Start servers
# ============================================================
echo "=============================================="
echo "  Starting TalentFlow..."
echo ""
echo "  Backend:  http://$LINUX_IP:5000"
echo "  Frontend: http://$LINUX_IP:5173"
echo ""
echo "  Open in browser (any device on network):"
echo "  → http://$LINUX_IP:5173"
echo "=============================================="
echo ""
info "Starting backend server..."
cd "$SERVER_DIR" && npm run dev &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Wait for backend to start
sleep 3

info "Starting frontend server..."
# Use node directly to avoid any shell permission issues with vite binary symlinks
cd "$CLIENT_DIR" && node node_modules/vite/bin/vite.js --host 0.0.0.0 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

ok "Backend PID: $BACKEND_PID"
ok "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers."

# Handle Ctrl+C gracefully
trap "echo ''; info 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; ok 'Servers stopped.'; exit 0" INT TERM

wait
