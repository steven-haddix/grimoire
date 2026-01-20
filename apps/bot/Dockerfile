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
COPY src ./src

RUN bun install --production

CMD ["bun", "src/index.ts"]
