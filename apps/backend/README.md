# Tuturuuu Backend

This app is the Rust backend service scaffold for backend work that should move
out of `apps/web`. The HTTP core is shared by the native Docker runtime and the
Cloudflare Workers entrypoint prepared in `wrangler.jsonc`.

## Runtime

- `PORT`: HTTP port. Defaults to `7820`.
- `BACKEND_ENV`: Runtime environment label. Defaults to `development`.
- `BACKEND_DEPLOYMENT_TARGET`: Runtime target label. Defaults to `container`
  for native builds and `cloudflare-workers` for Workers builds.
- `BACKEND_INTERNAL_TOKEN`: Bearer token required for internal job and migration
  inventory routes.

## Endpoints

- `GET /.well-known/*` / `HEAD /.well-known/*`: legacy-compatible cacheable
  empty `404` for unsupported well-known probes.
- `GET /~recover-browser-state` / `POST /~recover-browser-state`:
  legacy-compatible browser recovery route that serves the no-store reset form,
  enforces same-origin POST confirmation, clears site data and Supabase auth
  cookies, and redirects to login with `browserStateReset=1`.
- `GET /healthz`: liveness probe.
- `GET /readyz`: readiness probe; fails when `BACKEND_INTERNAL_TOKEN` is not
  configured.
- `GET /api/health`: legacy-compatible platform health route migrated from
  `apps/web`; returns `{ "status": "ok" }` with `Cache-Control: no-store`.
- `GET /api/v1/calendar/mock`: legacy-compatible deterministic mock calendar
  events migrated from `apps/web`.
- `POST` / `DELETE` `/api/v1/infrastructure/languages`: legacy-compatible locale
  preference cookie API for `NEXT_LOCALE`.
- `POST` / `DELETE` `/api/v1/infrastructure/sidebar`: legacy-compatible sidebar
  collapsed preference cookie API for `sidebar-collapsed`.
- `POST` / `DELETE` `/api/v1/infrastructure/sidebar/sizes`: legacy-compatible
  sidebar sizing preference cookie API for `sidebar-size` and
  `main-content-size`; DELETE preserves the legacy behavior of clearing only
  `sidebar-size`.
- `GET /api/v1/infrastructure/users/fields/types`: legacy-compatible static
  user field type metadata migrated from `apps/web`. The Rust route returns the
  deterministic ordered legacy payload without opening a Supabase admin client.
- `OPTIONS /api/v1/auth/password-login`, `OPTIONS
  /api/v1/auth/mobile/password-login`, `OPTIONS
  /api/v1/auth/mobile/send-otp`, `OPTIONS /api/v1/auth/mobile/verify-otp`,
  `OPTIONS /api/v1/auth/otp/send`, `OPTIONS /api/v1/auth/otp/verify`,
  `OPTIONS /api/v1/auth/otp/settings`, and
  `OPTIONS /api/v1/mobile/version-check`: method-level legacy-compatible CORS
  preflights that return the shared wildcard empty `204` response. Their
  paired auth `POST`, settings `GET`, or version-check `GET` methods remain
  legacy-owned.
- `OPTIONS /api/v1/auth/qr-login/challenges`, `OPTIONS
  /api/v1/auth/qr-login/challenges/:challengeId`, `OPTIONS
  /api/v1/auth/qr-login/challenges/:challengeId/approve`, `OPTIONS
  /api/v1/auth/mfa/mobile/challenges`, `OPTIONS
  /api/v1/auth/mfa/mobile/challenges/:challengeId`, `OPTIONS
  /api/v1/auth/mfa/mobile/challenges/:challengeId/approve`, and
  `OPTIONS /api/v1/auth/mfa/mobile/approvals`: method-level
  legacy-compatible bare empty `204` preflights. Their paired challenge
  creation, polling, approval, and listing methods remain legacy-owned.
- `OPTIONS /api/v1/workspaces/:wsId/external-projects/webgl-packages/upload`:
  method-level legacy-compatible WebGL upload preflight. Allowed CMS origins
  receive credentialed `PUT, OPTIONS` CORS headers; missing, malformed, or
  untrusted origins receive the legacy bare empty `204`. The protected `PUT`
  upload method remains legacy-owned.
- `POST /api/v1/workspaces/:wsId/user-groups/:groupId/group-checks/:postId/email`:
  legacy-compatible removed direct email route that returns `410 Gone`; emails
  are sent by the system queue after approval.
- `GET` / `POST` `/api/v1/workspaces/:wsId/slides`: legacy-compatible
  placeholder route that returns `501 Not implemented`.
- `PUT` / `DELETE` `/api/v1/workspaces/:wsId/slides/:slideId`:
  legacy-compatible placeholder route that returns `501 Not implemented`.
- `PUT /api/v1/infrastructure/migrate/grouped-score-names`: legacy-compatible
  disabled migration route; preserves the development-only guard and returns
  `410 MIGRATION_DISABLED` because the backing table was removed.
- `GET /api/migration/status`: runtime and route-ownership status consumed by
  `apps/tanstack-web`; requires `Authorization: Bearer <BACKEND_INTERNAL_TOKEN>`.
- `GET /api/migration/manifest`: checked TanStack migration route inventory,
  including exported HTTP methods for each legacy `route.ts`; requires
  `Authorization: Bearer <BACKEND_INTERNAL_TOKEN>`.
- `GET /api/migration/progress`: route ownership progress grouped by target
  owner and route kind; requires
  `Authorization: Bearer <BACKEND_INTERNAL_TOKEN>`.
- `GET /api/migration/cutover-gates`: backend-owned cutover gate state derived
  from the checked manifest plus required external evidence placeholders;
  requires `Authorization: Bearer <BACKEND_INTERNAL_TOKEN>`.
- `POST /internal/jobs/noop`: authenticated placeholder job route.

All JSON responses set `Content-Type: application/json` plus the shared security
headers `Content-Security-Policy: default-src 'none'; frame-ancestors 'none';
base-uri 'none'`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. Migrated public
legacy endpoints must preserve their legacy cache behavior in the OpenAPI
contract; `/api/health` is explicitly `Cache-Control: no-store`, and
`/.well-known/*` is `Cache-Control: public, max-age=300, must-revalidate`.

Internal job routes and migration inventory routes require
`BACKEND_INTERNAL_TOKEN` and a matching `Authorization: Bearer <token>` header.
The migration inventory includes legacy route source paths, so it must not be
published as an unauthenticated preview endpoint. Do not place token values in
`wrangler.jsonc`, Dockerfiles, or docs; configure them through environment
variables or Cloudflare secrets.

Run locally:

```sh
cd apps/backend
cargo run --features native --bin backend
```

Run the test suite:

```sh
cd apps/backend
cargo test
```

Build the future Cloudflare Worker bundle after installing the Workers Rust
tooling:

```sh
cd apps/backend
rustup target add wasm32-unknown-unknown
cargo install worker-build
worker-build --release -- --no-default-features --features worker
```

Deploy the backend Worker for preview traffic:

```sh
rustup target add wasm32-unknown-unknown
cargo install worker-build
bun wrangler secret put BACKEND_INTERNAL_TOKEN --config apps/backend/wrangler.jsonc
bun wrangler deploy --config apps/backend/wrangler.jsonc
```

`apps/backend/wrangler.jsonc` declares `BACKEND_INTERNAL_TOKEN` under
`secrets.required`. Wrangler prompts for the value during `secret put`; do not
commit the token value in `wrangler.jsonc`, `vars`, docs, or shell history.
`/readyz` reports not-ready until the secret exists.

After deployment, smoke-test the returned Worker origin. Before the TanStack
Worker is deployed, the backend-only curl checks are enough:

```sh
curl -fsS https://<backend-worker-origin>/healthz
curl -fsS https://<backend-worker-origin>/readyz
curl -fsS \
  -H "Authorization: Bearer ${BACKEND_INTERNAL_TOKEN:?set BACKEND_INTERNAL_TOKEN}" \
  https://<backend-worker-origin>/api/migration/status
```

After both preview Workers are deployed, use the repo smoke command so the
backend health/readiness probes, authenticated migration status, and TanStack
root shell are verified together:

```sh
BACKEND_WORKER_ORIGIN=https://<backend-worker-origin> \
TANSTACK_WEB_WORKER_ORIGIN=https://<tanstack-worker-origin> \
BACKEND_INTERNAL_TOKEN=<token> \
bun smoke:cloudflare
```

The smoke script reports status codes and timings only; it does not print the
bearer token. Remote Worker origins must use HTTPS; plaintext `http://` origins
are accepted only for `localhost` or `127.0.0.1` Wrangler dev smoke checks.

Use `bun check:cloudflare` from the repo root to verify the backend and
TanStack Wrangler configs before a preview deploy. Keep `BACKEND_INTERNAL_TOKEN`
and future service credentials in Cloudflare secrets; do not add values to
`wrangler.jsonc`.

For the TanStack preview Worker, configure the backend origin secrets after the
backend Worker URL is known. Use the same `BACKEND_INTERNAL_TOKEN` value on the
TanStack Worker so Start server functions can call protected backend inventory
endpoints:

```sh
bun wrangler secret put BACKEND_PUBLIC_ORIGIN --config apps/tanstack-web/wrangler.jsonc
bun wrangler secret put BACKEND_INTERNAL_URL --config apps/tanstack-web/wrangler.jsonc
bun wrangler secret put BACKEND_INTERNAL_TOKEN --config apps/tanstack-web/wrangler.jsonc
```

Both origin secrets initially point at the backend Worker origin. Server-side
calls prefer `BACKEND_INTERNAL_URL`; browser-safe calls prefer
`BACKEND_PUBLIC_ORIGIN`. The desired protected-traffic cutover is a Cloudflare
service binding from `apps/tanstack-web` to `tuturuuu-backend`, then a validator
update that accepts the binding before removing the internal backend URL secret.
