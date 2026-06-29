FROM oven/bun:1.3.14-alpine

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache docker-cli docker-cli-compose

COPY apps/web/docker/docker-control-server.js /usr/local/bin/docker-control-server.js

CMD ["bun", "/usr/local/bin/docker-control-server.js"]
