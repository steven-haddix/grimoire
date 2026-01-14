FROM oven/bun:1.3.6-slim
WORKDIR /app

COPY package.json bun.lock* ./
COPY src ./src

RUN bun install --production

CMD ["bun", "src/index.ts"]
