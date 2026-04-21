FROM oven/bun:1.3.13-alpine

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache docker-cli docker-cli-compose git openssh-client

COPY apps/web/docker/blue-green-watcher-entrypoint.js /usr/local/bin/blue-green-watcher-entrypoint.js

CMD ["bun", "/usr/local/bin/blue-green-watcher-entrypoint.js"]
