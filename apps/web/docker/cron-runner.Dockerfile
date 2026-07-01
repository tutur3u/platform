# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-alpine

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache docker-cli docker-cli-compose
RUN --mount=type=cache,id=platform-cron-runner-bun-install,target=/root/.bun/install/cache \
  bun add --exact cron-parser@5.6.1

COPY apps/web/docker/cron-runner-entrypoint.js /usr/local/bin/cron-runner-entrypoint.js

CMD ["bun", "/usr/local/bin/cron-runner-entrypoint.js"]
