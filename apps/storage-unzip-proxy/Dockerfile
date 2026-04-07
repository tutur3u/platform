FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json package.json
RUN bun install --production

FROM oven/bun:1.3.11-alpine AS runner

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY src ./src

ENV PORT=8788

EXPOSE 8788

CMD ["bun", "run", "src/server.js"]
