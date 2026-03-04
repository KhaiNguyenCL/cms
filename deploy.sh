#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — SignageCMS Production Deploy Script
#
#  Prerequisites:
#    - Node.js 20+, npm, PM2 installed globally
#    - PostgreSQL + Redis running
#    - .env file present in backend/
#    - Log dir exists: sudo mkdir -p /var/log/cms && sudo chown $USER /var/log/cms
#
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"

echo "=== [1/6] Pull latest code ==="
git -C "$REPO_ROOT" pull origin main

echo "=== [2/6] Install backend dependencies ==="
npm --prefix "$BACKEND" install --omit=dev

echo "=== [3/6] Build backend (TypeScript) ==="
npm --prefix "$BACKEND" run build

echo "=== [4/6] Install frontend dependencies + build ==="
npm --prefix "$FRONTEND" install --omit=dev
npm --prefix "$FRONTEND" run build

echo "=== [5/6] Reload backend (PM2 zero-downtime) ==="
# If PM2 process doesn't exist yet, start it; otherwise reload gracefully
if pm2 describe cms-backend > /dev/null 2>&1; then
  pm2 reload "$BACKEND/ecosystem.config.js" --env production
else
  pm2 start "$BACKEND/ecosystem.config.js" --env production
  pm2 save
fi

echo "=== [6/6] Reload Nginx ==="
if command -v nginx > /dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx
  echo "Nginx reloaded."
else
  echo "Nginx not found — skipping."
fi

echo ""
echo "Deploy complete!"
echo "Health check: curl http://localhost:3000/health"
