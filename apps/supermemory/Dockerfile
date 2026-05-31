# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /workspace

ENV NODE_ENV=production

COPY package.json bun.lock turbo.json ./
COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js
COPY apps/supermemory/package.json ./apps/supermemory/package.json

RUN --mount=type=cache,id=platform-supermemory-bun-install,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production --filter @tuturuuu/supermemory --linker hoisted

FROM oven/bun:1.3.14-alpine AS runner

WORKDIR /workspace

ENV NODE_ENV=production
ENV PORT=8787

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=deps --chown=app:app /workspace/package.json ./package.json
COPY --from=deps --chown=app:app /workspace/apps/supermemory/package.json ./apps/supermemory/package.json
COPY --chown=app:app apps/supermemory/src ./apps/supermemory/src

USER app

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["bun", "apps/supermemory/src/server.js"]
