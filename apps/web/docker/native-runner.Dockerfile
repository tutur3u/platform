# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=7803

RUN groupadd --system nodejs && useradd --system --gid nodejs --home-dir /app nextjs

COPY --chown=nextjs:nodejs apps/web/.next/standalone ./
COPY --chown=nextjs:nodejs apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs apps/web/docker/coolify-env.js ./apps/web/docker/coolify-env.js
COPY --chown=nextjs:nodejs apps/web/docker/prod-entrypoint.js ./apps/web/docker/prod-entrypoint.js
COPY --chown=nextjs:nodejs apps/web/docker/request-tracker.js ./apps/web/docker/request-tracker.js
COPY --chown=nextjs:nodejs apps/web/cron.config.json ./apps/web/cron.config.json
COPY --chown=nextjs:nodejs apps/web/public ./apps/web/public

EXPOSE 7803

USER nextjs

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 7803}/__platform/drain-status`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/web/docker/prod-entrypoint.js"]
