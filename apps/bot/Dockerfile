FROM oven/bun:1.3.10-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    make \
    g++ \
    pkg-config \
    libopus-dev \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* personas.json ./
COPY src ./src

RUN bun install --production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3001/health || exit 1

CMD ["bun", "src/index.ts"]
