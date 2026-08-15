FROM oven/bun:1.3.10-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libopus-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --production

FROM oven/bun:1.3.10-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    libopus0 \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY package.json personas.json ./
COPY src ./src

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf "http://localhost:${BOT_HTTP_PORT:-${PORT:-3001}}/health" || exit 1

CMD ["bun", "src/index.ts"]
