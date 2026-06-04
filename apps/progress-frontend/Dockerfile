# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /workspace

# Copy workspace manifests first (layer cache)
COPY package.json package-lock.json ./
COPY shared/jwt/package.json        ./shared/jwt/
COPY apps/auth-frontend/package.json    ./apps/auth-frontend/
COPY apps/progress-frontend/package.json ./apps/progress-frontend/
COPY packages/auth-service/package.json  ./packages/auth-service/
COPY packages/progress-service/package.json ./packages/progress-service/

# Install all workspace dependencies
RUN npm ci

# Copy source
COPY shared/                   ./shared/
COPY apps/progress-frontend/   ./apps/progress-frontend/

# Build Vite app
RUN npm run build --workspace @apps/progress-frontend

# ── Stage 2: Serve with nginx ───────────────────────────────────
FROM nginx:alpine

COPY --from=builder /workspace/apps/progress-frontend/dist /usr/share/nginx/html
COPY apps/progress-frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
