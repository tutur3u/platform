# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /workspace

ENV NODE_ENV=production

COPY package.json bun.lock turbo.json ./
COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js
COPY packages/realtime/package.json ./packages/realtime/package.json

RUN --mount=type=cache,id=platform-meet-realtime-bun-install,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production --filter @tuturuuu/realtime --linker hoisted

FROM oven/bun:1.3.14-alpine AS runner

WORKDIR /workspace

ENV NODE_ENV=production
ENV PORT=7816

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/package.json ./package.json
COPY packages/realtime ./packages/realtime
COPY apps/meet-realtime/src ./apps/meet-realtime/src

EXPOSE 7816

CMD ["bun", "apps/meet-realtime/src/index.ts"]
