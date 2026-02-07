FROM oven/bun:1.3.6-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    make \
    g++ \
    pkg-config \
    libopus-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY packages/data/package.json ./packages/data/package.json

RUN bun install --frozen-lockfile --production

COPY apps/bot ./apps/bot
COPY packages/data ./packages/data

WORKDIR /app/apps/bot

CMD ["bun", "src/index.ts"]
