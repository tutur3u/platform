# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.12 AS deps

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

# Copy workspace manifests first so dependency installation stays cached when
# application source files change.
# Keep these manifest COPY lines in sync with scripts/check-docker-web.js.
COPY package.json bun.lock turbo.json ./
COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js
COPY apps/calendar/package.json ./apps/calendar/package.json
COPY apps/database/package.json ./apps/database/package.json
COPY apps/external/package.json ./apps/external/package.json
COPY apps/finance/package.json ./apps/finance/package.json
COPY apps/meet/package.json ./apps/meet/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/nova/package.json ./apps/nova/package.json
COPY apps/playground/package.json ./apps/playground/package.json
COPY apps/redis/package.json ./apps/redis/package.json
COPY apps/rewise/package.json ./apps/rewise/package.json
COPY apps/shortener/package.json ./apps/shortener/package.json
COPY apps/storage-unzip-proxy/package.json ./apps/storage-unzip-proxy/package.json
COPY apps/tasks/package.json ./apps/tasks/package.json
COPY apps/track/package.json ./apps/track/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ai/package.json ./packages/ai/package.json
COPY packages/apis/package.json ./packages/apis/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/email-service/package.json ./packages/email-service/package.json
COPY packages/games/package.json ./packages/games/package.json
COPY packages/google/package.json ./packages/google/package.json
COPY packages/hooks/package.json ./packages/hooks/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/internal-api/package.json ./packages/internal-api/package.json
COPY packages/masonry/package.json ./packages/masonry/package.json
COPY packages/microsoft/package.json ./packages/microsoft/package.json
COPY packages/offline/package.json ./packages/offline/package.json
COPY packages/payment/package.json ./packages/payment/package.json
COPY packages/satellite/package.json ./packages/satellite/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/supabase/package.json ./packages/supabase/package.json
COPY packages/transactional/package.json ./packages/transactional/package.json
COPY packages/trigger/package.json ./packages/trigger/package.json
COPY packages/turnstile/package.json ./packages/turnstile/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/ui/vendor/xlsx-0.20.3.tgz ./packages/ui/vendor/xlsx-0.20.3.tgz
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/vercel/package.json ./packages/vercel/package.json
COPY packages/workflows/package.json ./packages/workflows/package.json

# Keep this install command in sync with scripts/check-docker-web.js.
RUN --mount=type=cache,id=platform-web-bun-install,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM oven/bun:1.3.12 AS dev

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /workspace ./
COPY . .

RUN chmod +x apps/web/docker/dev-entrypoint.sh

ENTRYPOINT ["./apps/web/docker/dev-entrypoint.sh"]
CMD ["bun", "run", "dev:web"]

FROM oven/bun:1.3.12 AS builder

WORKDIR /workspace

ENV CI=1
ENV DOCKER_WEB_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /workspace ./
COPY . .

RUN --mount=type=cache,id=platform-web-turbo,target=/workspace/.turbo \
  --mount=type=cache,id=platform-web-next-cache,target=/workspace/apps/web/.next/cache \
  --mount=type=secret,id=web_env,target=/tmp/web.env \
  bun --env-file=/tmp/web.env ./scripts/build-web-docker.js

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=7803

RUN groupadd --system nodejs && useradd --system --gid nodejs --home-dir /app nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/docker/coolify-env.js ./apps/web/docker/coolify-env.js
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/docker/prod-entrypoint.js ./apps/web/docker/prod-entrypoint.js
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/docker/request-tracker.js ./apps/web/docker/request-tracker.js
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public

EXPOSE 7803

USER nextjs

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 7803}/__platform/drain-status`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/web/docker/prod-entrypoint.js"]
