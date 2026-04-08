#!/usr/bin/env bash
# =============================================================================
#  DMS Signage — Docker Deploy Script
#  Chạy trên server Ubuntu: bash deploy.sh
#
#  Yêu cầu:
#    - Docker + Docker Compose v2 đã cài
#    - Certbot đã cài: sudo apt install certbot
#    - Domain dms.saigontech.net đã trỏ A record về IP server này
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="dms.saigontech.net"
SSL_DIR="$REPO_ROOT/docker/ssl"

echo "▶ [1/5] Lấy SSL certificate..."
if [ ! -f "$SSL_DIR/certs/cert.pem" ]; then
    mkdir -p "$SSL_DIR/certs" "$SSL_DIR/private"
    # Dừng port 80 nếu đang chạy
    docker compose -f "$REPO_ROOT/docker-compose.yml" down 2>/dev/null || true
    sudo certbot certonly --standalone -d "$DOMAIN" \
        --non-interactive --agree-tos -m khainq@dnsvn.com
    sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem "$SSL_DIR/certs/cert.pem"
    sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   "$SSL_DIR/private/key.pem"
    sudo chown -R "$USER:$USER" "$SSL_DIR"
    echo "  ✓ SSL cert đã lấy"
else
    echo "  ✓ SSL cert đã có sẵn, bỏ qua"
fi

echo "▶ [2/5] Build frontend..."
cd "$REPO_ROOT/frontend"
npm install --omit=dev
npm run build
echo "  ✓ Frontend built → frontend/dist/"

echo "▶ [3/5] Build Docker images..."
cd "$REPO_ROOT"
docker compose build --no-cache

echo "▶ [4/5] Khởi động tất cả services..."
docker compose up -d

echo "▶ [5/5] Kiểm tra trạng thái..."
sleep 10
docker compose ps

echo ""
echo "============================================"
echo "  ✓ Deploy xong!"
echo "  Web:    https://$DOMAIN"
echo "  Health: https://$DOMAIN/health"
echo "============================================"

# Tự động gia hạn SSL cert mỗi tháng
RENEW_CMD="certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $SSL_DIR/certs/cert.pem && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $SSL_DIR/private/key.pem && docker compose -f $REPO_ROOT/docker-compose.yml restart nginx"
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 3 1 * * $RENEW_CMD") | crontab -
echo "  ✓ Đã đặt lịch tự gia hạn SSL (mỗi tháng)"
