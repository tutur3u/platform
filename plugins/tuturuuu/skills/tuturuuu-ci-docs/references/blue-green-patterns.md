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
- PID locks need explicit fail/resume/replace behavior. Git lock conflicts
  should stay in the watcher process: wait on fresh recoverable locks, then
  auto-remove them only when the error is a Git lock conflict and the lock is
  old enough to be safe.
- Watcher failures stay in the loop. Record failed deployment rows, clear stale
  pending handoff files, and cap retries per commit.
- The watcher sends a build/deploy incident email only for the first failed
  history row per commit hash. Reuse Infrastructure Monitoring Docker recovery
  recipients from `emailAlertRecipients`, then
  `PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS`, then `updatedByEmail`; log email
  send failures without changing deployment results.
- Watcher runtime scripts execute from the repo root. If watcher code imports a
  workspace package, declare that package as root-resolvable and add a
  root-runtime import regression test so the containerized watcher can load it
  after a frozen install.
- Host-side Docker daemon recovery must treat timed-out Docker CLI probes as
  daemon unresponsive, not only explicit connection failures. Keep the probe
  timeout operator-tunable, restart Docker through host-configured commands
  only, recreate the watcher stack after recovery, and send a deduplicated
  force-restart recovery email through the configured Docker recovery
  recipients when a Docker restart was required for services to recover.
- Watcher restart/recreate must reconcile current `HEAD` against the latest
  successful deployment and deploy `HEAD` when runtime history lags.
- Watcher bootstrap must refresh the companion `web-docker-control` sidecar and
  ensure the companion `web-cron-runner` service exists after recreating
  `web-blue-green-watcher`. Use force-recreate for `web-docker-control` so
  admin recovery picks up sidecar changes, and use no-recreate for the cron
  runner so healthy cron execution is not interrupted.
- Apps/web must route Docker recovery through the narrow `web-docker-control`
  sidecar with allowlisted watcher/cron-runner actions only. Do not mount the
  Docker socket into apps/web or expose arbitrary Docker commands through the
  UI/API.
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
  allocation with a real reserve for the Docker VM and sibling containers. Keep
  blue/green max parallelism conservative by default, and keep direct Compose
  fallbacks concrete because Compose cannot resolve helper-only `auto` values by
  itself. Resolve helper-only `auto` values to concrete Compose env values
  before any BuildKit `up`, `restart`, `stop`, `rm`, `ps`, or health-check path;
  Compose should never see `services[buildkit].mem_limit` as `auto`.
- Blue/green runs that use the root-script default caps may use the adaptive
  local profile at `tmp/docker-web/buildkit/resource-profile.json`. BuildKit
  transport/resource failures such as `code = Unavailable`, `closing transport`,
  `error reading from server: EOF`, `received prior goaway`,
  `ResourceExhausted`, `cannot allocate memory`, `context deadline exceeded`,
  exit code 137, or `[internal] waiting for connection` should keep stepping
  through budget-valid profiles in the same command until the build succeeds or
  the retry ladder is exhausted. Persist each retry profile before trying it,
  skip fixed profiles above the effective Docker budget during normal
  selection, and reset persisted state back to the budget-derived `default`
  profile when `floor` still fails so later runs do not get stuck starting at
  `floor`. The retry ladder includes a `serial` profile (`10g`, 1 CPU, max
  parallelism 1) after `low` (`10g`, 2 CPUs) so memory-exhausted Next builds can
  reduce inner concurrency before shrinking the BuildKit memory cap. If
  `default` also fails and Docker's reported memory limit still has headroom, a
  hard-limit rescue may retry a larger fixed profile such as `low` or `serial`
  before surfacing the failure. Explicit memory-exhaustion signatures such as
  `cannot allocate memory` or exit code 137 may prefer the hard-limit rescue
  before smaller profiles. Default runs should promote stale persisted fallback
  state back to the largest Docker-hard-limit rescue profile, preferring lower
  CPU at equal memory, before starting BuildKit. Each retry should restart the
  Compose-owned BuildKit service and recreate the remote Buildx builder when
  `docker buildx inspect tuturuuu` reports `Status: inactive`. Explicit build
  cap flags or
  `DOCKER_WEB_BUILD_MEMORY`, `DOCKER_WEB_BUILD_CPUS`, or
  `DOCKER_WEB_BUILD_MAX_PARALLELISM` opt out for that run.
- BuildKit max parallelism only limits Docker's build graph. The web image
  still runs Turbo inside the Dockerfile, so pass an inner Turbo concurrency cap
  through the builder stage as well. Docker web builds should default Turbo
  concurrency to the current `DOCKER_WEB_BUILD_MAX_PARALLELISM` value and allow
  `DOCKER_WEB_TURBO_CONCURRENCY` only as an explicit override. When logs show
  exit code 137 or `SIGSEGV (Address boundary error)` in `@tuturuuu/*:build`
  tasks, lower the inner Turbo cap before raising memory.
- Watcher-owned deploy failures should prune failed-build residue before the
  next poll so dangling images and stale Buildx cache do not accumulate for a
  commit that will remain blocked. By default, failed child deploys run
  `docker buildx prune --builder <builder> --all --force` when
  `BUILDX_BUILDER` or `DOCKER_WEB_BUILD_BUILDER_NAME` is known, then
  `docker image prune --force --filter dangling=true`. Set
  `DOCKER_WEB_WATCHER_PRUNE_FAILED_BUILD_RESIDUE=0` to opt out for a specific
  host/run.
- Normal post-build cleanup should keep warm BuildKit state bounded instead of
  deleting it all. Leave `DOCKER_WEB_BUILDKIT_PRUNE_MODE=bounded` unless the
  build state is disposable, and tune `DOCKER_WEB_BUILDKIT_PRUNE_UNTIL` plus
  `DOCKER_WEB_BUILDKIT_PRUNE_KEEP_STORAGE` before reaching for full prune mode.
  Docker E2E remains the exception because its project-scoped BuildKit state is
  intentionally short-lived.
- Watcher images need Docker CLI, Compose plugin, and Buildx when production
  builds are capped.
- Native web fallback builds (`DOCKER_WEB_NATIVE_BUILD=1`) should build Next.js
  artifacts on the host, then package the runner image with plain `docker build`
  by default. Strip builder-routing env such as `BUILDX_BUILDER` from that
  packaging subprocess so a remote BuildKit outage does not affect the native
  fallback. Keep `DOCKER_WEB_NATIVE_RUNNER_BUILDX=1` as the explicit opt-in when
  that lightweight packaging step must use the configured Buildx builder.
  Native mode should skip support-service image builds by default and reuse the
  existing support images. Use `DOCKER_WEB_NATIVE_SUPPORT_BUILD=1` to build
  support images locally with `docker compose build`, or
  `DOCKER_WEB_NATIVE_SUPPORT_BUILDX=1` to opt those builds back into the
  configured Buildx builder.
- Containerized watcher handoffs must run from the mirrored host checkout path
  via `PLATFORM_HOST_WORKSPACE_DIR`, not from a container-only path.
- When production deployment starts from a linked Git worktree, the watcher
  service must also receive and mount `DOCKER_WEB_GIT_COMMON_DIR` at the same
  absolute path inside the container. Linked worktree `.git` files point at
  `.git/worktrees/<name>` under the common Git directory, and Git inside the
  watcher container fails with `fatal: not a git repository` unless that common
  metadata directory is mounted. Strip local `GIT_*` env from watcher child
  processes so Git discovers the mounted checkout normally.
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
- Docker web helpers should auto-enable the `cloudflared` Compose profile when
  root `.env.local` (or an explicit `--env-file`) contains `CF_TUNNEL_TOKEN`.
  Map that alias to Compose's existing `CLOUDFLARED_TOKEN` env, keep
  `DOCKER_CLOUDFLARED_TOKEN` and `CLOUDFLARED_TOKEN` precedence for explicit
  overrides, propagate `DOCKER_WEB_WITH_CLOUDFLARED=1` into watcher recovery,
  and honor `DOCKER_WEB_WITH_CLOUDFLARED=0|false|no|off` as auto-detect opt-out
  unless the operator explicitly passes `--with-cloudflared` or
  `--profile cloudflared`.
- Keep the optional `cloudflared` services in the web/proxy network namespace
  (`service:web` for dev, `service:web-proxy` for production) so remotely
  managed tunnel routes that use `localhost:7803` reach the Docker app rather
  than the tunnel container loopback.
- Host-started `bun serve:web:docker:bg:watch` containers should treat a fully
  idle blue/green runtime as missing active deployment and bootstrap the current
  commit so fresh hosts create `web-proxy`, active/standby lanes, and
  `cloudflared` when that profile is enabled.
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
