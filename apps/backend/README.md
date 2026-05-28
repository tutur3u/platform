# Tuturuuu Backend

This app is the Go backend service scaffold for backend work that should move
out of `apps/web`.

## Runtime

- `PORT`: HTTP port. Defaults to `7820`.
- `BACKEND_ENV`: Runtime environment label. Defaults to `development`.
- `BACKEND_INTERNAL_TOKEN`: Bearer token required for internal job routes.

## Endpoints

- `GET /healthz`: liveness probe.
- `GET /readyz`: readiness probe; fails when `BACKEND_INTERNAL_TOKEN` is not
  configured.
- `POST /internal/jobs/noop`: authenticated placeholder job route.

Run locally:

```sh
cd apps/backend
go run ./cmd/backend
```

Run the test suite:

```sh
cd apps/backend
go test ./...
```
