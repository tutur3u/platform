# syntax=docker/dockerfile:1.7

FROM golang:1.26.3-alpine AS builder

WORKDIR /src

COPY apps/backend/go.mod ./apps/backend/go.mod

WORKDIR /src/apps/backend
RUN go mod download

WORKDIR /src
COPY apps/backend ./apps/backend

WORKDIR /src/apps/backend
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/backend ./cmd/backend

FROM gcr.io/distroless/static-debian12:nonroot AS runner

WORKDIR /app

COPY --from=builder /out/backend /app/backend

ENV BACKEND_ENV=production
ENV PORT=7820

EXPOSE 7820

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/app/backend", "healthcheck"]

USER nonroot:nonroot

CMD ["/app/backend"]
