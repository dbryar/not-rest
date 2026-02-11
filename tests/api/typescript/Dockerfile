FROM oven/bun:1-alpine

WORKDIR /app

# Install deps first (layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ src/

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
