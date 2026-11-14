# MOTION AI — single image for api / bot / worker (choose role via CMD).
FROM node:22-bookworm-slim
# Chrome Headless Shell runtime libs (Remotion) + fonts with Uzbek/Cyrillic glyphs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 \
    libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
    fonts-noto-core fonts-noto-color-emoji openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build:web
# Pre-download the headless browser at build time.
RUN node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('browser ok'))"
ENV NODE_ENV=production MEDIA_DIR=/data/media DATABASE_URL=file:/data/motion.db
VOLUME /data
EXPOSE 8080
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx src/main.ts ${ROLE:-all}"]
