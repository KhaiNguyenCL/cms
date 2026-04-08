# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Nginx + frontend dist baked in ───────────────────────────────────
FROM nginx:1.25-alpine

# Copy built frontend
COPY --from=builder /app/dist /app/frontend/dist

# Nginx config được mount lúc runtime (chứa domain + SSL path)
# SSL certs được mount lúc runtime từ host

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
