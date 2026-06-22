# syntax=docker/dockerfile:1.7

FROM rust:1-alpine AS builder

WORKDIR /src

RUN apk add --no-cache musl-dev

COPY apps/backend/Cargo.toml apps/backend/Cargo.lock apps/backend/build.rs ./apps/backend/
COPY apps/backend/src ./apps/backend/src
COPY apps/tanstack-web/migration/route-manifest.json ./apps/tanstack-web/migration/route-manifest.json

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/apps/backend/target \
    cd apps/backend && cargo build --release --locked --features native --bin backend && \
    mkdir -p /out && \
    cp target/release/backend /out/backend

FROM gcr.io/distroless/static-debian12:nonroot AS runner

WORKDIR /app

COPY --from=builder /out/backend /app/backend

ENV BACKEND_ENV=production
ENV BACKEND_DEPLOYMENT_TARGET=container
ENV PORT=7820

EXPOSE 7820

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/app/backend", "healthcheck"]

USER nonroot:nonroot

CMD ["/app/backend"]
