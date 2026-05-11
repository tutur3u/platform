# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.13 AS base

WORKDIR /workspace

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7814

COPY . .

RUN --mount=type=cache,id=platform-hive-bun-install,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM base AS dev

ENV NODE_ENV=development

EXPOSE 7814

CMD ["bun", "run", "--filter", "@tuturuuu/hive", "dev"]

FROM base AS builder

ENV NODE_ENV=production
# Throttle static generation; `build:docker` caps the V8 heap at 8 GB during
# image builds to reduce Bun Turbopack worker storms (SIGILL / exit 132) under Docker.
ENV HIVE_DOCKER_BUILD=1

RUN --mount=type=cache,id=platform-hive-next-cache,target=/workspace/apps/hive/.next/cache \
  --mount=type=secret,id=web_env,target=/tmp/web.env \
  bun --env-file=/tmp/web.env run --filter @tuturuuu/hive build:docker

FROM builder AS runner

ENV NODE_ENV=production

EXPOSE 7814

CMD ["bun", "run", "--filter", "@tuturuuu/hive", "start"]
