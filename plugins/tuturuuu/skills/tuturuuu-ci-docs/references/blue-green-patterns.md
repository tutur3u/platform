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

- Long-running watchers must lock one branch and upstream at startup, stay on
  that locked branch, and stop if the checked-out branch changes unexpectedly.
- Watcher-managed deployment checkouts are disposable by default. Before
  startup branch switches and before each poll's upstream comparison, reset
  tracked changes with `git reset --hard HEAD`, remove untracked files and
  directories with `git clean -fd`, fetch the locked upstream, and hard-reset to
  the tracked upstream if local `HEAD` is behind, ahead, or diverged. Ignored
  files are left alone.
- `DOCKER_WEB_WATCHER_WORKTREE_RESET_DISABLED=1` is the escape hatch for
  preserving the old protective behavior: dirty worktrees block, ahead/diverged
  branches are skipped, and only fast-forward pulls are attempted.
- Do not implement watcher-managed `main` prebuilds or `main` to `production`
  promotion. Advance production outside the watcher through the release process,
  then let the watcher deploy the locked branch.
- Dashboard revert controls must flow through control request files, stay
  operator-authorized, respect build-lock safety, and avoid native browser
  dialogs.
- Cached production revert is an active-build-canceling operator override. It
  verifies the cached target first, cancels active build work, then runs the
  no-build recovery and writes the rollback pin.
- Keep the 5 newest unique successful deployed blue/green image tags for cached
  instant revert. Cached revert should use the no-build recovery path, record
  deployment kind `instant-revert`, and write a deployment pin so normal
  upstream sync does not immediately overwrite the rollback. Older retained
  deployments fall back to the rollback-pin path and may rebuild.
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
- Before any automatic deploy, recovery handoff, runtime recovery, standby
  refresh, or reconciliation build for the latest commit, the watcher should
  inspect the latest GitHub Actions workflow runs for that exact `head_sha`
  whenever GitHub validation is enabled or discoverable. A latest completed
  workflow run with `failure`, `cancelled`, `timed_out`, `startup_failure`, or
  `action_required` suppresses local rebuilding, records watcher status
  `validation-blocked`, clears pending recovery handoffs, and does not count as
  a failed deployment attempt. Pending or missing workflow runs should not block
  deploys. `DOCKER_WEB_WATCHER_GITHUB_VALIDATION=1` forces validation,
  `DOCKER_WEB_WATCHER_GITHUB_VALIDATION_DISABLED=1` disables it.
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
- Blue/green runs that use the root-script default caps may use the adaptive
  local profile at `tmp/docker-web/buildkit/resource-profile.json`. BuildKit
  transport/resource failures such as `code = Unavailable`, `closing transport`,
  `error reading from server: EOF`, `received prior goaway`,
  `ResourceExhausted`, `cannot allocate memory`, `context deadline exceeded`,
  or `[internal] waiting for connection` should retry once at the next lower
  profile and persist that profile for future runs. The retry should restart
  the Compose-owned BuildKit service and recreate the remote Buildx builder when
  `docker buildx inspect tuturuuu` reports `Status: inactive`. Explicit build
  cap flags or `DOCKER_WEB_BUILD_MEMORY`, `DOCKER_WEB_BUILD_CPUS`, or
  `DOCKER_WEB_BUILD_MAX_PARALLELISM` opt out for that run.
- Watcher-owned deploy failures should prune failed-build residue before the
  next poll so dangling images and stale Buildx cache do not accumulate for a
  commit that will remain blocked. By default, failed child deploys run
  `docker buildx prune --builder <builder> --all --force` when
  `BUILDX_BUILDER` or `DOCKER_WEB_BUILD_BUILDER_NAME` is known, then
  `docker image prune --force --filter dangling=true`. Set
  `DOCKER_WEB_WATCHER_PRUNE_FAILED_BUILD_RESIDUE=0` to opt out for a specific
  host/run.
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
- Watcher-managed Infrastructure projects must not inherit the platform Docker
  Redis runtime. Keep new managed projects at `redis_enabled=false`, strip
  generic `UPSTASH_REDIS_REST_*`, `SRH_TOKEN`, and Docker-specific
  `DOCKER_UPSTASH_*` values from managed project deploy environments, and only
  expose Redis to a project when project-scoped
  `MANAGED_PROJECT_<PROJECT_ID>_UPSTASH_REDIS_REST_URL` and
  `MANAGED_PROJECT_<PROJECT_ID>_UPSTASH_REDIS_REST_TOKEN` values are configured.
- Completed migration containers such as `hive-db-migrate` and
  `supermemory-db-migrate` should be removed by Compose project and service
  labels, not only `docker compose ps` output, because one-off run containers
  can remain stopped under names like `tuturuuu-hive-db-migrate-*` and make the
  cluster look unhealthy after a successful migration. Project-label cleanup
  must honor Compose `--project-name`/`-p`, `COMPOSE_PROJECT_NAME`, and
  `DOCKER_WEB_COMPOSE_PROJECT_NAME`.
- Log-drain Postgres is an optional script-owned preflight, not a Compose
  `depends_on` gate for `web`, blue/green lanes, or the watcher. If
  `log-drain-postgres` stays unhealthy after one service-container recreate,
  continue with `PLATFORM_LOG_DRAIN_ENABLED=false` unless
  `DOCKER_WEB_LOG_DRAIN_REQUIRED=1`; never remove or recreate the persistent
  volume automatically because incompatible database files and data-directory
  corruption need an operator-approved backup, migration, or reset.

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
