# MOTION AI: API + Mini App + Telegram bot in one image (choose role via ROLE=api|bot|all).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build:web
ENV NODE_ENV=production MEDIA_DIR=/data/media DATABASE_URL=file:/data/orders.db
VOLUME /data
EXPOSE 8080
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx src/main.ts ${ROLE:-all}"]
