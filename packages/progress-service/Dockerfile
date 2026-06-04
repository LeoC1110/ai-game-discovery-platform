FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/jwt/package.json            ./shared/jwt/
COPY apps/auth-frontend/package.json    ./apps/auth-frontend/
COPY apps/progress-frontend/package.json ./apps/progress-frontend/
COPY packages/auth-service/package.json  ./packages/auth-service/
COPY packages/progress-service/package.json ./packages/progress-service/

RUN npm ci --omit=dev

COPY shared/                    ./shared/
COPY packages/progress-service/ ./packages/progress-service/

EXPOSE 4002

CMD ["node", "packages/progress-service/server.js"]
