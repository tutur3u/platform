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
- `TUTURUUU_APP_COORDINATION_SECRET`: Preferred secret for verifying
  Tuturuuu-managed `ttr_app_` app-session JWTs on contact/profile routes. The
  backend also accepts the existing fallback secret names
  `APP_COORDINATION_TOKEN_SECRET`, `SUPABASE_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_SERVICE_KEY` for compatibility.
  Non-production local runs fall back to the shared development secret used by
  the TypeScript auth package; production and Cloudflare preview must configure
  an explicit secret.
- `SUPABASE_URL`: Canonical Supabase origin for the Rust contact data adapter.
  The backend also accepts `SUPABASE_SERVER_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  and `DOCKER_INTERNAL_SUPABASE_URL` while the migration is in progress.
- `SUPABASE_SERVICE_ROLE_KEY`: Service-role credential for server-owned contact
  profile hydration and `support_inquiries` persistence. The backend also
  accepts `SUPABASE_SERVICE_KEY` and `SUPABASE_SECRET_KEY` for compatibility.
  Keep this value in environment variables, ignored local Worker files, or
  Cloudflare secrets only; never put it in `wrangler.jsonc` `vars` or
  browser-visible frontend config.

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
- `GET /api/v1/devboxes/cache` and `POST /api/v1/devboxes/cache/prune`:
  legacy-compatible devbox cache routes. Rust accepts CLI app-session Bearer
  tokens for the platform target with the `cli:access` scope or
  browser/non-app-session Supabase credentials, requires a root workspace
  `MEMBER` row, and returns the current legacy `{ "caches": [] }` list payload
  or `{ "message": "Devbox cache prune requested." }` prune acknowledgement.
- `GET /api/v1/infrastructure/ai/models`: legacy-compatible public AI model
  catalog backed by `private.ai_gateway_models`. Rust reads through the
  server-owned Supabase REST adapter with private-schema headers, keeps the
  fixed public column list, preserves provider/type/tag/enabled/search/ids
  filters, supports exact-count pagination, and caps ID filters at 100.
- `GET /api/v1/ai/whitelist/me`: legacy-compatible current-user AI whitelist
  status route. Rust preserves app-session-first auth for satellite apps,
  falls back to browser Supabase cookies only when no app-session token is
  present, reads only `enabled` from `private.ai_whitelisted_emails`, and
  returns the derived `{ email, enabled }` payload.
- `GET` / `POST` `/api/v1/infrastructure/ai/whitelist/emails` and
  `GET` / `POST` `/api/v1/infrastructure/ai/whitelist/domains`:
  legacy-compatible infrastructure AI whitelist collection routes. Rust
  revalidates a normal Supabase browser session or non-app-session Bearer
  token, requires a `@tuturuuu.com` operator email, reads and inserts private
  whitelist table rows through the server-owned private-schema REST adapter,
  preserves `page`/`pageSize`/`q`, `created_at.desc` ordering, exact-count
  pagination, raw row lists, Zod-style create validation messages, `enabled`
  defaults, 201 create wrappers, and plain-text collection failure bodies.
- `PUT` / `DELETE` `/api/v1/infrastructure/ai/whitelist/{email}` and
  `PUT` / `DELETE` `/api/v1/infrastructure/ai/whitelist/domain/{domain}`:
  legacy-compatible protected AI whitelist detail routes. Rust revalidates the
  same operator session boundary as the list routes, decodes the path segment,
  patches or deletes matching private whitelist rows through the service-role
  private-schema REST adapter, and preserves the legacy success and failure
  bodies.
- `GET /api/v1/infrastructure/post-email-queue`: legacy-compatible protected
  post email queue infrastructure summary. Rust revalidates a normal Supabase
  browser session or non-app-session Bearer token, requires root workspace
  membership, reads `post_email_queue` through the service-role Supabase REST
  adapter, preserves the legacy queue status, workspace, and recent batch
  aggregation shape, and keeps workspace/batch read failures non-fatal.
- `GET /api/v1/workspaces/limits`: legacy-compatible workspace creation limit
  check. Rust validates browser Supabase auth cookies with Supabase Auth,
  bypasses counting for `tuturuuu.com` and `xwf.tuturuuu.com` emails, otherwise
  reads only an exact count of non-deleted workspaces created by the
  authenticated user, and returns the derived legacy limit payload.
- `GET /api/v1/workspaces/:wsId/settings/permissions/check`:
  legacy-compatible workspace permission check route. Rust revalidates a normal
  Supabase browser session or non-app-session Bearer token, ignores app-session
  tokens and the legacy `userId` query parameter, resolves personal/workspace
  identifiers, requires workspace access, and returns the derived
  `{ "hasPermission": boolean }` result from role, default, creator, and admin
  permission context.
- `GET /api/v1/workspaces/:wsId/crawlers/status`: legacy-compatible crawler
  status lookup. Rust preserves the legacy workspace-agnostic behavior,
  validates the required `url` query parameter, reads the exact `crawled_urls`
  row through the server-owned Supabase REST adapter, and returns the raw
  `crawledUrl` with raw `crawled_url_next_urls` rows ordered by
  `created_at.desc`; missing crawled URLs return `{ "crawledUrl": null,
  "relatedUrls": [] }`.
- `GET /api/auth/me`: legacy-compatible current browser session route. Rust
  revalidates the Supabase browser cookie or non-app-session Bearer token with
  Supabase Auth and returns the raw legacy `{ user }` payload, or the legacy
  unauthorized message.
- `GET /api/auth/mfa/totp/assurance-level`: legacy-compatible Supabase MFA
  assurance-level route. Rust revalidates the browser cookie or non-app-session
  Bearer token with Supabase Auth, then derives the legacy AAL payload from the
  JWT `aal` / `amr` claims plus verified Supabase Auth factors on the user JSON.
- `GET` / `POST` `/api/auth/mfa/totp/factors` and `GET` / `DELETE`
  `/api/auth/mfa/totp/factors/:factorId`: legacy-compatible Supabase TOTP
  factor routes. Rust mirrors Auth JS factor listing from the revalidated
  Supabase user JSON, enrolls and unenrolls factors through Supabase Auth REST,
  preserves the QR-code normalization and factor-detail lookup behavior, and
  keeps the legacy no-store/error response shape.
- `PATCH /api/v1/user/profile`: legacy-compatible browser-session profile
  mutation. Rust revalidates the Supabase browser cookie or non-app-session
  Bearer token, validates `display_name`, `bio`, and `avatar_url` with the
  legacy limits, and updates only the authenticated user's `users` row through
  the server-owned Supabase REST adapter.
- `GET` / `PATCH` `/api/v1/user/onboarding-progress`: legacy-compatible
  onboarding progress route. Rust validates browser Supabase auth cookies with
  Supabase Auth, reads the authenticated user's `onboarding_progress` row
  through the server-owned Supabase REST adapter, and PATCH upserts only the
  legacy allowlisted onboarding fields with `user_id` fixed to the
  authenticated user.
- `GET /api/v1/users/me/profile`: contact migration route. It
  verifies Tuturuuu app-session JWTs from `Authorization: Bearer ttr_app_...`,
  `tuturuuu_web_app_session`, or `tuturuuu_app_session`, then reads `users` and
  `user_private_details` through the server-owned Supabase REST adapter and
  returns the legacy profile response shape with no-store cache headers.
- `PATCH /api/v1/users/me/profile`: authenticated mutation route.
  Cookie-authenticated requests require same-origin `Origin` or `Referer`
  confirmation, then Rust validates and persists `display_name`, `bio`, and
  `avatar_url` updates to the `users` row through Supabase REST.
- `POST /api/v1/inquiries` and `PATCH /api/v1/inquiries/:id`:
  authenticated support-inquiry routes. Inquiry creation verifies app-session
  JWTs, requires same-origin confirmation for cookie auth, validates the legacy
  inquiry JSON shape and field limits, then inserts `support_inquiries` with
  `creator_id` from the resolved user. Inquiry updates revalidate the browser
  Supabase session, require a `tuturuuu.com` or `xwf.tuturuuu.com` user email,
  validate the legacy `is_read` and `is_resolved` flags, and patch
  `support_inquiries` through the server-owned Supabase REST adapter. Media
  signed URLs remain legacy-owned until storage handling moves behind Rust.
- `GET /api/admin/tasks/embeddings/stats`: legacy-compatible admin task
  embedding statistics route. Rust validates browser Supabase auth cookies with
  Supabase Auth, requires a `tuturuuu.com` or `xwf.tuturuuu.com` user email,
  reads exact task counts through the server-owned Supabase REST adapter, and
  returns only derived coverage statistics.
- `GET` / `POST` `/api/v1/internal/holidays`, `POST`
  `/api/v1/internal/holidays/bulk`, and `PUT` / `DELETE`
  `/api/v1/internal/holidays/:holidayId`: legacy-compatible Vietnamese holiday
  routes. GET reads the public holiday list through the server-owned Supabase
  REST adapter with optional parseInt-style year filtering. Mutations revalidate
  the caller's Supabase browser cookie or Bearer token, require a root workspace
  `MEMBER` row, and use that caller token for duplicate checks, bulk upserts,
  and writes so `vietnamese_holidays` RLS remains active.
- `GET /api/v1/mobile/version-check`: public mobile update-policy route. Rust
  validates `platform=ios|android` and strict `version=x.y.z`, reads the fixed
  root workspace mobile policy config IDs through the server-owned Supabase REST
  adapter, and returns the legacy `supported` / `update-recommended` /
  `update-required` payload with wildcard CORS headers.
- `GET` / `PUT` `/api/v1/infrastructure/mobile-versions`: protected admin
  mobile policy route. Rust revalidates the browser Supabase session cookie or
  non-app-session Bearer token, requires root workspace
  `manage_workspace_roles` through `has_workspace_permission`, reads and
  validates the fixed root workspace mobile policy config IDs for snapshots,
  and upserts the nine root workspace policy config rows for writes while
  preserving the legacy `{ ios, android, webOtpEnabled }` and success/error
  bodies.
- `GET /api/v1/infrastructure/timezones` and `PUT` / `DELETE`
  `/api/v1/infrastructure/timezones/:timezoneId`: protected infrastructure
  timezone routes. Rust revalidates the browser Supabase session cookie or
  non-app-session Bearer token, requires root workspace
  `manage_workspace_roles`, reads `private.timezones` through the server-owned
  private-schema Supabase REST adapter ordered by `value`, and patches/deletes
  detail rows through the same private-schema adapter. Collection `POST`
  remains legacy-owned until timezone creation moves behind Rust.
- `GET /api/v1/infrastructure/user-status-changes`: legacy-compatible
  workspace user status change list. Rust requires a normal Supabase browser
  session cookie or non-app-session Bearer token, forwards that caller token to
  Supabase REST so `workspace_user_status_changes` RLS remains active, preserves
  the required `ws_id` query parameter, parseInt-style `limit`/`offset` range
  behavior, exact-count pagination, and legacy
  `{ data, count }` / error-response bodies.
- `GET /api/v1/infrastructure/users`: legacy-compatible workspace user export
  list. Rust uses the same caller-token paginated list helper for
  `workspace_users`, so RLS remains active while preserving the legacy required
  `ws_id`, parseInt-style `limit`/`offset`, exact-count pagination, raw row list,
  and `{ data, count }` / error-response bodies.
- `GET /api/v1/infrastructure/classes`,
  `GET /api/v1/infrastructure/product-categories`, and
  `GET /api/v1/infrastructure/score-names`: legacy-compatible catalog export
  lists for `workspace_user_groups`, `product_categories`, and
  `user_group_metrics`. Rust uses the shared caller-token paginated list helper
  so RLS remains active while preserving the required `ws_id`, parseInt-style
  `limit`/`offset`, exact-count pagination, raw row lists, and legacy error
  bodies.
- `GET /api/v1/infrastructure/lessons` and
  `GET /api/v1/infrastructure/packages`: legacy-compatible content export
  lists for `private.user_group_posts` and `workspace_products`. Lessons
  preserves the legacy no-auth service-role private-schema export with the
  `workspace_user_groups.ws_id` inner filter. Packages revalidates the browser
  Supabase session cookie or non-app-session Bearer token, normalizes workspace
  identifiers, requires `view_inventory`, and reads `workspace_products` through
  the service-role Supabase REST adapter. Both preserve the required `ws_id`,
  parseInt-style `limit`/`offset`, exact-count pagination, raw row lists, and
  legacy error bodies.
- `GET /api/v1/infrastructure/product-prices`,
  `GET /api/v1/infrastructure/product-units`, and
  `GET /api/v1/infrastructure/warehouses`: legacy-compatible inventory setup
  export lists for `private.inventory_products`, `private.inventory_units`, and
  `private.inventory_warehouses`. Product prices scope through the
  `workspace_products` inner workspace filter. Rust accepts inventory
  app-session credentials or normal Supabase browser/non-app-session Bearer
  credentials, normalizes workspace identifiers, requires inventory
  catalog/setup read permissions, and preserves the required `ws_id`,
  parseInt-style `limit`/`offset`, exact-count pagination, raw row lists, and
  legacy error bodies.
- `GET /api/v1/infrastructure/bills`,
  `GET /api/v1/infrastructure/roles`, and
  `GET /api/v1/infrastructure/transaction-categories`: legacy-compatible
  workspace export lists for `finance_invoices`, `workspace_user_groups`, and
  `transaction_categories`. Rust uses the shared caller-token paginated list
  helper so RLS remains active while preserving the required `ws_id`,
  parseInt-style `limit`/`offset`, exact-count pagination, raw row lists, and
  legacy error bodies.
- `GET /api/v1/infrastructure/abuse-events`: legacy-compatible root-workspace
  abuse event list. Rust revalidates the browser Supabase session cookie or
  non-app-session Bearer token, checks root workspace membership with the
  caller token, reads `abuse_events` through Supabase REST so RLS remains
  active, and preserves the legacy `ip`, `type`, `success`, `page`, and
  `pageSize` query behavior plus the `{ data, count, page, pageSize,
  totalPages }` response envelope.
- `GET /api/v1/infrastructure/blocked-ips`: legacy-compatible root-workspace
  blocked IP list. Rust revalidates the browser Supabase session cookie or
  non-app-session Bearer token, checks root workspace membership with the caller
  token, reads `blocked_ips` with the legacy `unblocked_by_user` embed through
  Supabase REST so RLS remains active, and preserves the legacy `status`, `ip`,
  `page`, and `pageSize` query behavior plus the `{ data, count, page,
  pageSize, totalPages }` response envelope. POST/DELETE remain legacy-owned
  until Redis cache mutation parity moves to Rust.
- `GET /api/v1/infrastructure/suspensions`: legacy-compatible active user
  suspension list. Rust revalidates the browser Supabase session cookie or
  non-app-session Bearer token, requires root workspace
  `manage_workspace_roles` through `has_workspace_permission` with the caller
  token, reads active `user_suspensions` rows through the server-owned Supabase
  REST adapter ordered by `suspended_at`, and returns the legacy raw row array.
  POST and detail DELETE remain legacy-owned until suspension mutations move to
  Rust.
- `GET` / `POST` `/api/v1/infrastructure/email-blacklist` and `GET` / `PUT` /
  `DELETE` `/api/v1/infrastructure/email-blacklist/:entryId`:
  legacy-compatible root-workspace email blacklist reads and writes. Rust
  revalidates the browser Supabase session cookie or non-app-session Bearer
  token, checks root workspace membership with the caller token, reads, inserts,
  updates, and deletes `email_blacklist` through Supabase REST so RLS remains
  active, preserves collection ordering, preserves the detail GET non-root `401`
  quirk, maps `PGRST116` detail GET misses to the legacy `404` body, preserves
  POST/PUT Zod-style validation responses, maps duplicate creates to `409`, and
  preserves detail update/delete prefetch/not-found behavior.
- `GET /api/v1/infrastructure/bill-coupons`,
  `GET /api/v1/infrastructure/bill-packages`,
  `GET /api/v1/infrastructure/class-attendance`,
  `GET /api/v1/infrastructure/class-members`,
  `GET /api/v1/infrastructure/class-packages`,
  `GET /api/v1/infrastructure/class-scores`,
  `GET /api/v1/infrastructure/package-stock-changes`, and
  `GET /api/v1/infrastructure/student-feedbacks`: legacy-compatible
  related-filter export lists. Rust reuses the caller-token paginated list
  helper with route-specific embedded select strings and related-table
  workspace filters such as `finance_invoices.ws_id`,
  `workspace_user_groups.ws_id`, `workspace_products.ws_id`, and
  `workspace_users.ws_id`, preserving Supabase RLS, exact-count pagination, raw
  row list responses, and legacy error bodies.
- `GET /api/v1/infrastructure/coupons`,
  `GET /api/v1/infrastructure/user-coupons`,
  `GET /api/v1/infrastructure/user-monthly-reports`, and
  `GET /api/v1/infrastructure/user-monthly-report-logs`: legacy-compatible
  protected migration export reads for private promotion and monthly report
  data. Rust
  revalidates the browser Supabase session cookie or non-app-session Bearer
  token, normalizes workspace identifiers, requires `manage_external_migrations`
  through the shared workspace permission resolver, reads the private
  `workspace_promotions` / `user_linked_promotions` tables and monthly report
  views through the server-owned Supabase REST adapter, reattaches the legacy
  `workspace_promotions: { ws_id }` object to linked promotion rows, and
  preserves exact-count pagination plus legacy error bodies.
- `GET /api/v1/infrastructure/payment-methods` and
  `GET /api/v1/infrastructure/wallets`: legacy-compatible protected finance
  export reads for `private.workspace_wallets`. Rust revalidates the browser
  Supabase session cookie or non-app-session Bearer token, normalizes workspace
  identifiers, requires `view_transactions` through the shared workspace
  permission resolver, and preserves exact-count pagination plus legacy error
  bodies. `GET /api/v1/infrastructure/wallet-transactions` remains legacy-owned
  until its RPC-backed permission/query behavior is migrated separately.
- `GET /api/v1/topic-announcement-verifications/:token`: public Topic
  Announcements email verification route. Rust decodes the token path segment,
  hashes it with SHA-256, reads and updates
  `private.topic_announcement_contact_verifications` through the server-owned
  Supabase REST adapter, and returns the legacy HTML success, invalid,
  already-used, expired, and failure pages.
- `GET|POST /api/v1/infrastructure/changelog`,
  `GET|PUT|DELETE /api/v1/infrastructure/changelog/:id`,
  `POST /api/v1/infrastructure/changelog/:id/publish`, and
  `GET /api/v1/infrastructure/changelog/slug/:slug`: legacy-compatible
  changelog readers and admin writes backed by the server-owned Supabase REST
  adapter. List and id reads validate browser Supabase auth cookies with
  Supabase Auth, check root workspace `manage_changelog` through
  `has_workspace_permission`, and fall back to published-only public reads for
  anonymous, malformed-cookie, expired, or unauthorized sessions. Writes
  revalidate the caller session, require `manage_changelog`, preserve the legacy
  slug normalization, duplicate-slug conflict, validation, not-found, and
  publish timestamp semantics, and use the caller token for PostgREST mutations
  so `changelog_entries` RLS remains active. Changelog upload remains
  legacy-owned until storage handling moves behind Rust.
- `GET /api/v1/aurora/forecast`: legacy-compatible public Aurora forecast
  reader backed by the server-owned Supabase REST adapter. Rust reads the
  statistical and ML forecast tables with `date.asc` ordering, normalizes row
  `date` fields to the legacy `YYYY-MM-DD` response shape, and returns the
  combined `{ statistical_forecast, ml_forecast }` object.
- `POST /api/v1/aurora/forecast`, `POST /api/v1/aurora/ml-metrics`, and
  `POST /api/v1/aurora/statistical-metrics`: legacy-compatible protected
  Aurora ingestion routes. Rust preserves the legacy `AURORA_EXTERNAL_URL` and
  `AURORA_EXTERNAL_WSID` config checks, revalidates the browser Supabase
  session, enforces the exact `@tuturuuu.com` email-domain gate, fetches the
  Aurora external forecast or metric payloads, and inserts the normalized rows
  into the Aurora Supabase tables with the caller token.
- `POST /api/v1/aurora/health`: legacy-compatible protected Aurora health
  probe. Rust revalidates the browser Supabase session, preserves the legacy
  exact `@tuturuuu.com` email-domain gate, calls
  `AURORA_EXTERNAL_URL/health`, and returns the legacy success, auth, and
  upstream-failure JSON bodies.
- `OPTIONS /api/v1/auth/password-login`, `OPTIONS
/api/v1/auth/mobile/password-login`, `OPTIONS
/api/v1/auth/mobile/send-otp`, `OPTIONS /api/v1/auth/mobile/verify-otp`,
  `OPTIONS /api/v1/auth/otp/send`, `OPTIONS /api/v1/auth/otp/verify`,
  `OPTIONS /api/v1/auth/otp/settings`, and
  `OPTIONS /api/v1/mobile/version-check`: method-level legacy-compatible CORS
  preflights that return the shared wildcard empty `204` response. Their
  paired auth `POST` and settings `GET` methods remain legacy-owned.
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
- `GET` / `PUT` / `PATCH` / `POST` `/api/v1/infrastructure/migrate/:migration`:
  terminal decommission for legacy one-off batch migration helpers. Rust keeps
  the development/local-E2E guard and returns `410 MIGRATION_DISABLED` for
  methods the legacy route exported, instead of exposing broad admin batch
  reads or writes from the Cloudflare-compatible backend.
- `PUT /api/workspaces/:wsId/{products/categories,products/units,transactions/categories,users/indicators,users/indicators/groups,wallets,wallets/transactions}/migrate`:
  terminal decommission for obsolete workspace migration write helpers. Rust
  keeps the development/local-E2E guard and returns `410 MIGRATION_DISABLED`
  instead of preserving broad Supabase admin writes from the
  Cloudflare-compatible backend.
- `GET /api/share/course/:courseId`, `GET /api/sync-logs`,
  `POST /api/payment/migrations/subscriptions/cross-check`, and
  `GET /api/users/search`: terminal decommission for retired legacy APIs. Rust
  returns `410 ENDPOINT_REMOVED` and preserves method-level `Allow` headers
  while maintained replacement paths or phase-specific routes remain separate
  migration work.
- `GET /api/migration/status`: runtime and route-ownership status consumed by
  `apps/tanstack-web`; requires `Authorization: Bearer <BACKEND_INTERNAL_TOKEN>`.
  The response includes redacted contact data adapter readiness
  (`contactData.configured`, missing logical setting names, and the Supabase
  origin only) so preview deployments can verify configuration without exposing
  service-role credentials.
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

The contact/profile foundation endpoints require app-session authentication,
not `BACKEND_INTERNAL_TOKEN`. Mutating cookie-authenticated contact routes also
require same-origin confirmation so Cloudflare previews do not accidentally
create credentialed cross-site write APIs. Browser-facing TanStack code should
call these only through Start server functions or `packages/internal-api`
facades that forward request cookies server-side; do not expose backend bearer
tokens or service-role secrets to browser bundles.

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
cargo install worker-build --locked
cargo check --locked --target wasm32-unknown-unknown --no-default-features --features worker
worker-build --release -- --no-default-features --features worker
```

Deploy the backend Worker for preview traffic:

```sh
rustup target add wasm32-unknown-unknown
cargo install worker-build --locked
bun wrangler secret put BACKEND_INTERNAL_TOKEN --config apps/backend/wrangler.jsonc
bun wrangler secret put TUTURUUU_APP_COORDINATION_SECRET --config apps/backend/wrangler.jsonc
bun wrangler secret put SUPABASE_URL --config apps/backend/wrangler.jsonc
bun wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/backend/wrangler.jsonc
bun wrangler secret put CRON_SECRET --config apps/backend/wrangler.jsonc
bun wrangler secret put DISCORD_APP_DEPLOYMENT_URL --config apps/backend/wrangler.jsonc
bun wrangler secret put AURORA_EXTERNAL_URL --config apps/backend/wrangler.jsonc
bun wrangler secret put AURORA_EXTERNAL_WSID --config apps/backend/wrangler.jsonc
bun wrangler deploy --config apps/backend/wrangler.jsonc
```

`apps/backend/wrangler.jsonc` declares `BACKEND_INTERNAL_TOKEN`,
`TUTURUUU_APP_COORDINATION_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and
`DISCORD_APP_DEPLOYMENT_URL`, `AURORA_EXTERNAL_URL`, and
`AURORA_EXTERNAL_WSID` under
`secrets.required`. Wrangler prompts for values during `secret put`; do not
commit those values in `wrangler.jsonc`, `vars`, docs, or shell history.
`/readyz` reports not-ready until `BACKEND_INTERNAL_TOKEN` exists.
Contact/profile preview APIs also require the Supabase secrets, the Rust-owned
Discord cron proxy requires `CRON_SECRET` plus `DISCORD_APP_DEPLOYMENT_URL`,
and the Rust-owned Aurora health/ingest routes require `AURORA_EXTERNAL_URL`
with `AURORA_EXTERNAL_WSID` for ingestion.

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
backend health/readiness probes, authenticated migration status, missing/invalid
migration-token rejection, and TanStack root shell are verified together:

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
bun wrangler secret put BACKEND_INTERNAL_TOKEN --config apps/tanstack-web/wrangler.jsonc
```

`BACKEND_PUBLIC_ORIGIN` initially points at the backend Worker origin.
Server-side calls prefer the Cloudflare `BACKEND` service binding and use
`BACKEND_INTERNAL_URL` only as a non-Cloudflare HTTP fallback for local, Docker,
or emergency preview runs. Browser-safe calls use `BACKEND_PUBLIC_ORIGIN`.
