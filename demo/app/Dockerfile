FROM oven/bun:latest AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY . .
EXPOSE 8080
CMD ["bun", "run", "src/server.ts"]
