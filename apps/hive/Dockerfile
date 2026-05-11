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

CMD ["bun", "--cwd", "apps/hive", "run", "dev"]

FROM base AS builder

ENV NODE_ENV=production

RUN --mount=type=cache,id=platform-hive-next-cache,target=/workspace/apps/hive/.next/cache \
  --mount=type=secret,id=web_env,target=/tmp/web.env \
  bun --env-file=/tmp/web.env --filter @tuturuuu/hive build

FROM builder AS runner

ENV NODE_ENV=production

EXPOSE 7814

CMD ["bun", "--filter", "@tuturuuu/hive", "start"]
