# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14 AS deps

WORKDIR /workspace

ENV CI=1

# Keep workspace manifest COPY lines in sync with scripts/check-docker-web.js.
COPY package.json bun.lock turbo.json ./
COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js
COPY apps/tanstack-web/package.json ./apps/tanstack-web/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/internal-api/package.json ./packages/internal-api/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/ui/vendor/xlsx-0.20.3.tgz ./packages/ui/vendor/xlsx-0.20.3.tgz
COPY packages/utils/package.json ./packages/utils/package.json

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

FROM oven/bun:1.3.14 AS builder

WORKDIR /workspace

ENV CI=1
ENV NODE_ENV=production

COPY --from=deps /workspace ./
COPY . .

RUN --mount=type=cache,id=platform-tanstack-web-vite,target=/workspace/apps/tanstack-web/.vite \
  bun run --filter @tuturuuu/tanstack-web build

FROM oven/bun:1.3.14-alpine AS runner

WORKDIR /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=7824

COPY --from=builder /workspace/apps/tanstack-web/.output ./.output

EXPOSE 7824

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 7824}/`).then((response) => process.exit(response.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", ".output/server/index.mjs"]
