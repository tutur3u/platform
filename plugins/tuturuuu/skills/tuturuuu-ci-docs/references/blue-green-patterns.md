# Blue/Green Deployment Patterns

Load this reference for Docker web deployment, watcher, BuildKit, monitoring, or
infrastructure dashboard changes.

## Runtime Ownership

- The blue/green watcher owns Docker orchestration. Production `apps/web` reads
  mounted runtime snapshots; it must not mount the Docker socket just to show
  infrastructure health.
- Monitoring dashboards should read the explicit read-only runtime mount through
  `PLATFORM_BLUE_GREEN_MONITORING_DIR`, not repo-relative paths inside the
  production container.
- Operator actions flow through the narrow writable control mount exposed via
  `PLATFORM_BLUE_GREEN_CONTROL_DIR`; the watcher consumes and clears request
  files.
- Pending control files should be reflected back into the UI so operators do
  not spam duplicate actions.

## Watcher Behavior

- Long-running watchers must lock branch and upstream at startup, use
  fast-forward pulls, and stop if the checked-out branch changes.
- Dirty or diverged worktrees should be logged and skipped instead of forcing
  merges.
- Production watchers can auto-promote `main` to `production` only when
  `production` is a fast-forward ancestor of `main`, the newest `main` commit is
  at least 10 minutes old, and every latest GitHub check/status for that SHA is
  complete and non-failing with at least one reported CI signal. Record the
  promotion state under `tmp/docker-web/watch` and poll the gates every 5
  seconds.
- Prebuild the newest fast-forward `main` candidate on standby before CI is
  green when GitHub checks are inspectable, but never update `production` until
  the promotion gates pass or an authorized manual override request bypasses
  only the CI/age gates. Treat build-lock conflicts during prebuild/standby
  refresh as `deployment-active` deferrals, not failed deployment attempts.
- Dashboard promotion and revert controls must flow through control request
  files, stay operator-authorized, respect dirty-worktree/build-lock/divergence
  safety gates, and avoid native browser dialogs. Read revert requests before
  queued promotion requests; cached revert supersedes queued promotion.
- Authorized manual production promotion and cached production revert are
  active-build-canceling operator overrides. Manual promotion cancels only after
  fast-forward/up-to-date validation passes and clears an active rollback pin as
  operator intent to resume production. Cached revert verifies the cached target
  first, clears pending promotion, cancels active build work, then runs the
  no-build recovery and writes the rollback pin.
- Keep the 5 newest unique successful deployed blue/green image tags for cached
  instant revert. Cached revert should use the no-build recovery path, record
  deployment kind `instant-revert`, and write a deployment pin so auto-promotion
  does not immediately overwrite the rollback. Older retained deployments fall
  back to the rollback-pin path and may rebuild.
- PID locks need explicit fail/resume/replace behavior. Stale Git
  `index.lock` files may be auto-removed only when the error is an index-lock
  conflict and the lock is old enough to be safe.
- Watcher failures stay in the loop. Record failed deployment rows, clear stale
  pending handoff files, and cap retries per commit.
- The watcher sends a build/deploy incident email only for the first failed
  history row per commit hash. Reuse Infrastructure Monitoring Docker recovery
  recipients from `emailAlertRecipients`, then
  `PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS`, then `updatedByEmail`; log email
  send failures without changing deployment results.
- Watcher restart/recreate must reconcile current `HEAD` against the latest
  successful deployment and deploy `HEAD` when runtime history lags.
- GitHub-facing watcher progress must be opt-in and published as sanitized
  Check Runs only. Keep the payload allowlisted to stage/status metadata,
  commit SHA/short SHA, branch/upstream, deployment kind, aggregate stage
  counts, and safe timestamps/durations; never publish raw logs, raw errors,
  env values, host paths, hostnames, user identifiers, emails, tokens, or
  secret-shaped text.
- Prefer the root Infrastructure GitHub Bot token issuer for production Check
  Runs. Use the Infrastructure GitHub Bot page to enable watcher auto-pickup:
  apps/web issues a dedicated watcher-only client token, writes
  `blue-green-github-bot-runtime.request.json` in the blue/green control
  directory, and the watcher moves it into
  `blue-green-github-bot-runtime.json` under its runtime directory before
  fetching short-lived GitHub App installation tokens with `checks: write`. A
  queued runtime credential is the Check Run opt-in signal, so production does
  not need GitHub-related watcher env for this path. Manual generated-token env
  remains supported for local/emergency cases with
  `TUTURUUU_CI_CHECKS_ENABLED=1`, `TUTURUUU_CI_GITHUB_TOKEN_URL`, and
  `TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN`; apps/web still stores the GitHub App
  private key server-side. Static token paths also need
  `TUTURUUU_CI_CHECKS_ENABLED=1`. Preserve token precedence for compatibility:
  `TUTURUUU_CI_GITHUB_TOKEN`, explicit generated token endpoint, watcher
  auto-pickup runtime credential, then `GITHUB_TOKEN`.

## BuildKit And Compose

- Docker documents that `docker compose build --memory` is not supported by
  BuildKit. Use the Compose-owned `buildkit` service and a remote Buildx
  builder instead.
- Do not use the Buildx `docker-container` driver for the platform capped
  builder because it creates containers outside the Compose `platform` group.
- Production web serve helpers should default BuildKit memory to
  `--build-memory auto` so the cap follows Docker's configured memory
  allocation. Keep blue/green max parallelism conservative by default, and keep
  direct Compose fallbacks concrete because Compose cannot resolve helper-only
  `auto` values by itself.
- Watcher images need Docker CLI, Compose plugin, and Buildx when production
  builds are capped.
- Containerized watcher handoffs must run from the mirrored host checkout path
  via `PLATFORM_HOST_WORKSPACE_DIR`, not from a container-only path.
- Internal support services that power AI capabilities, such as Supermemory,
  should be wired as health-gated blue/green support services. If the upstream
  vendor ships an enterprise image or deployment package, wrap/tag that artifact
  for the local bake flow instead of vendoring the public repository as the
  production source of truth.
- Docker web env resolution should auto-configure Supermemory for production
  deploys and watcher recovery: generate/persist internal Supermemory API,
  Postgres, and Better Auth secrets under `tmp/docker-web`, inject them through
  the shared Compose env, and preserve explicit `DOCKER_SUPERMEMORY_*` or
  standard `SUPERMEMORY_*` overrides.
- Production Docker web serving should prefer root `.env.local` over inherited
  `DOCKER_WEB_ENV_FILE` or `DOCKER_WEB_COMPOSE_*ENV_FILE` values when no
  explicit `--env-file` was passed. `ttr box setup` writes local Supabase values
  into `apps/web/.env.local`, so prod and blue/green watcher flows must reject
  local Supabase origins unless `DOCKER_WEB_ALLOW_LOCAL_SUPABASE=1` is set for a
  local production-image rehearsal.
- When `SUPERMEMORY_ENABLED=false` or `DOCKER_SUPERMEMORY_ENABLED=false` is
  explicit, blue/green helpers should remove the Supermemory sidecar from
  support builds, starts, and health gates. This keeps local-only E2E shards from
  pulling the private enterprise image while production remains enabled by
  default.
- Watcher-managed Infrastructure projects should use the integrated Docker
  Redis runtime by default. Generate or reuse `tmp/docker-web/redis-token`, set
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `SRH_TOKEN` from
  the Docker Redis helper, ignore stale generic host `UPSTASH_REDIS_REST_*`
  values, and opt out only when the project explicitly has `redis_enabled=false`.
- Completed migration containers such as `hive-db-migrate` and
  `supermemory-db-migrate` should be removed by Compose project and service
  labels, not only `docker compose ps` output, because one-off run containers
  can remain stopped under names like `tuturuuu-hive-db-migrate-*` and make the
  cluster look unhealthy after a successful migration. Project-label cleanup
  must honor Compose `--project-name`/`-p`, `COMPOSE_PROJECT_NAME`, and
  `DOCKER_WEB_COMPOSE_PROJECT_NAME`.

## Observability

- Deployment checks through `web-proxy` should target internal
  `/__platform/drain-status` paths instead of public health routes that can hit
  middleware/rate limits.
- Keep legacy runtime files and log-drain data together until the drain captures
  all required frontend, backend, proxy, and cron traffic natively.
- Deployment aggregation must not invent an `unknown` deployment from requests
  that lack stamp/color context.
- Request explorers may group by normalized pathname, but should preserve raw
  URI/query context for investigation.
