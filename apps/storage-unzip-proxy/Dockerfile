FROM oven/bun:1.3.12-alpine AS deps

WORKDIR /app

COPY package.json package.json
RUN bun install --production

FROM oven/bun:1.3.12-alpine AS runner

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=deps --chown=app:app /app/package.json ./package.json
COPY --chown=app:app src ./src

USER app

ENV PORT=8788

EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["bun", "run", "src/server.js"]
