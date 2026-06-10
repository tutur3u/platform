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

## BuildKit And Compose

- Docker documents that `docker compose build --memory` is not supported by
  BuildKit. Use the Compose-owned `buildkit` service and a remote Buildx
  builder instead.
- Do not use the Buildx `docker-container` driver for the platform capped
  builder because it creates containers outside the Compose `platform` group.
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
- When `SUPERMEMORY_ENABLED=false` or `DOCKER_SUPERMEMORY_ENABLED=false` is
  explicit, blue/green helpers should remove the Supermemory sidecar from
  support builds, starts, and health gates. This keeps local-only E2E shards from
  pulling the private enterprise image while production remains enabled by
  default.

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
