FROM node:22-alpine
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY shared/jwt/package.json            ./shared/jwt/
COPY apps/auth-frontend/package.json    ./apps/auth-frontend/
COPY apps/progress-frontend/package.json ./apps/progress-frontend/
COPY packages/auth-service/package.json  ./packages/auth-service/
COPY packages/progress-service/package.json ./packages/progress-service/

# Install production deps only
RUN npm ci --omit=dev

# Copy source
COPY shared/                  ./shared/
COPY packages/auth-service/   ./packages/auth-service/

EXPOSE 4001

CMD ["node", "packages/auth-service/server.js"]
