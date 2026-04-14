# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.12 AS dev

WORKDIR /workspace

ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN bun install --frozen-lockfile
RUN chmod +x apps/web/docker/dev-entrypoint.sh

ENTRYPOINT ["./apps/web/docker/dev-entrypoint.sh"]
CMD ["bun", "run", "dev:web"]

FROM oven/bun:1.3.12 AS builder

WORKDIR /workspace

ENV CI=1
ENV DOCKER_WEB_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY . .

RUN bun install --frozen-lockfile
RUN --mount=type=secret,id=web_env,target=/tmp/web.env \
  sh -c 'set -a && if [ -f /tmp/web.env ]; then . /tmp/web.env; fi && set +a && bun run build:web'

FROM node:22-alpine AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=7803

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public

EXPOSE 7803

USER nextjs

CMD ["node", "apps/web/server.js"]
