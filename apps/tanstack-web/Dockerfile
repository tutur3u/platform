# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14 AS deps

WORKDIR /workspace

ENV CI=1

# Copy workspace manifests first so dependency installation stays cached when
# application source files change.
# Keep these manifest COPY lines in sync with scripts/check-docker-web.js.
COPY package.json bun.lock turbo.json ./
COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js
COPY apps/apps/package.json ./apps/apps/package.json
COPY apps/calendar/package.json ./apps/calendar/package.json
COPY apps/chat/package.json ./apps/chat/package.json
COPY apps/cms/package.json ./apps/cms/package.json
COPY apps/database/package.json ./apps/database/package.json
COPY apps/drive/package.json ./apps/drive/package.json
COPY apps/external/package.json ./apps/external/package.json
COPY apps/finance/package.json ./apps/finance/package.json
COPY apps/hive/package.json ./apps/hive/package.json
COPY apps/hive-realtime/package.json ./apps/hive-realtime/package.json
COPY apps/infra/package.json ./apps/infra/package.json
COPY apps/inventory/package.json ./apps/inventory/package.json
COPY apps/mail/package.json ./apps/mail/package.json
COPY apps/meet/package.json ./apps/meet/package.json
COPY apps/mind/package.json ./apps/mind/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/nova/package.json ./apps/nova/package.json
COPY apps/playground/package.json ./apps/playground/package.json
COPY apps/qr/package.json ./apps/qr/package.json
COPY apps/redis/package.json ./apps/redis/package.json
COPY apps/rewise/package.json ./apps/rewise/package.json
COPY apps/shortener/package.json ./apps/shortener/package.json
COPY apps/storage-unzip-proxy/package.json ./apps/storage-unzip-proxy/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY apps/supermemory/package.json ./apps/supermemory/package.json
COPY apps/tasks/package.json ./apps/tasks/package.json
COPY apps/tanstack-web/package.json ./apps/tanstack-web/package.json
COPY apps/teach/package.json ./apps/teach/package.json
COPY apps/track/package.json ./apps/track/package.json
COPY apps/learn/package.json ./apps/learn/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ai/package.json ./packages/ai/package.json
COPY packages/apis/package.json ./packages/apis/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/devbox/package.json ./packages/devbox/package.json
COPY packages/email-service/package.json ./packages/email-service/package.json
COPY packages/games/package.json ./packages/games/package.json
COPY packages/google/package.json ./packages/google/package.json
COPY packages/hive-ui/package.json ./packages/hive-ui/package.json
COPY packages/hooks/package.json ./packages/hooks/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/internal-api/package.json ./packages/internal-api/package.json
COPY packages/masonry/package.json ./packages/masonry/package.json
COPY packages/microsoft/package.json ./packages/microsoft/package.json
COPY packages/mind-ui/package.json ./packages/mind-ui/package.json
COPY packages/offline/package.json ./packages/offline/package.json
COPY packages/payment/package.json ./packages/payment/package.json
COPY packages/realtime/package.json ./packages/realtime/package.json
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
RUN --mount=type=cache,id=platform-tanstack-web-bun-install,target=/root/.bun/install/cache \
  set -eu; \
  attempt=1; \
  while [ "$attempt" -le 3 ]; do \
    if bun install --frozen-lockfile --filter @tuturuuu/tanstack-web; then \
      break; \
    fi; \
    echo "bun install attempt ${attempt} failed; scrubbing Bun install cache before retry..." >&2; \
    bun pm cache rm 2>/dev/null || true; \
    if [ "$attempt" -eq 3 ]; then \
      echo "bun install failed after 3 attempts. Try: docker builder prune" >&2; \
      exit 1; \
    fi; \
    attempt=$((attempt + 1)); \
    sleep 5; \
  done

FROM oven/bun:1.3.14 AS dev

WORKDIR /workspace

ENV CI=1
ENV NODE_ENV=development

COPY --from=deps /workspace ./
COPY . .

CMD ["bun", "run", "--filter", "@tuturuuu/tanstack-web", "dev:app"]

FROM node:26-bookworm-slim AS builder

WORKDIR /workspace

ENV CI=1
ENV NODE_ENV=production
ENV TANSTACK_WEB_RUNTIME=node

COPY --from=deps /workspace ./
COPY . .
COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun

RUN --mount=type=cache,id=platform-tanstack-web-turbo,target=/workspace/.turbo \
  --mount=type=cache,id=platform-tanstack-web-vite,target=/workspace/apps/tanstack-web/.vite \
  --mount=type=secret,id=turbo_api,target=/run/secrets/turbo_api,required=false \
  --mount=type=secret,id=turbo_remote_cache_signature_key,target=/run/secrets/turbo_remote_cache_signature_key,required=false \
  --mount=type=secret,id=turbo_team,target=/run/secrets/turbo_team,required=false \
  --mount=type=secret,id=turbo_token,target=/run/secrets/turbo_token,required=false \
  set -eu; \
  if [ -s /run/secrets/turbo_api ]; then export TURBO_API="$(cat /run/secrets/turbo_api)"; fi; \
  if [ -s /run/secrets/turbo_remote_cache_signature_key ]; then export TURBO_REMOTE_CACHE_SIGNATURE_KEY="$(cat /run/secrets/turbo_remote_cache_signature_key)"; fi; \
  if [ -s /run/secrets/turbo_team ]; then export TURBO_TEAM="$(cat /run/secrets/turbo_team)"; fi; \
  if [ -s /run/secrets/turbo_token ]; then export TURBO_TOKEN="$(cat /run/secrets/turbo_token)"; fi; \
  bun run turbo:local run build:docker -F @tuturuuu/tanstack-web

FROM node:26-bookworm-slim AS runner

WORKDIR /app/apps/tanstack-web

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=7824
ENV TANSTACK_WEB_RUNTIME=node

COPY --from=builder /workspace/node_modules/.bun /app/node_modules/.bun
COPY --from=builder /workspace/apps/tanstack-web/node_modules ./node_modules
COPY --from=builder /workspace/packages /app/packages
COPY --from=builder /workspace/apps/tanstack-web/dist ./dist
COPY --from=builder /workspace/apps/tanstack-web/docker/healthcheck.mjs ./docker/healthcheck.mjs
COPY --from=builder /workspace/apps/tanstack-web/docker/server.mjs ./docker/server.mjs

EXPOSE 7824

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "docker/healthcheck.mjs"]

CMD ["node", "docker/server.mjs"]
