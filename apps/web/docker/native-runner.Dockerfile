# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=7803

ARG PLATFORM_BUILD_BUILT_AT=
ARG PLATFORM_BUILD_COMMIT_HASH=
ARG PLATFORM_BUILD_COMMIT_MESSAGE=
ARG PLATFORM_BUILD_COMMIT_SHORT_HASH=
ARG PLATFORM_BUILD_DEPLOYMENT_STAMP=
ARG PLATFORM_BUILD_DEPLOYMENT_URL=
ARG PLATFORM_BUILD_ENVIRONMENT=
ARG PLATFORM_BUILD_REF_NAME=

ENV PLATFORM_BUILD_BUILT_AT=${PLATFORM_BUILD_BUILT_AT}
ENV PLATFORM_BUILD_COMMIT_HASH=${PLATFORM_BUILD_COMMIT_HASH}
ENV PLATFORM_BUILD_COMMIT_MESSAGE=${PLATFORM_BUILD_COMMIT_MESSAGE}
ENV PLATFORM_BUILD_COMMIT_SHORT_HASH=${PLATFORM_BUILD_COMMIT_SHORT_HASH}
ENV PLATFORM_BUILD_DEPLOYMENT_STAMP=${PLATFORM_BUILD_DEPLOYMENT_STAMP}
ENV PLATFORM_BUILD_DEPLOYMENT_URL=${PLATFORM_BUILD_DEPLOYMENT_URL}
ENV PLATFORM_BUILD_ENVIRONMENT=${PLATFORM_BUILD_ENVIRONMENT}
ENV PLATFORM_BUILD_REF_NAME=${PLATFORM_BUILD_REF_NAME}

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
