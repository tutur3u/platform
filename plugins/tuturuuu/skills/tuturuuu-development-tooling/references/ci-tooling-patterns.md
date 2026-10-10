# CI And Tooling Patterns

Load this reference when changing root scripts, CI workflows, plugin validation,
formatting behavior, or repo-wide verification.

## Incremental Oxc and Worker adoption

Use root-pinned Oxlint/Oxfmt through `bun oxc:lint`, `bun oxc:format` and
`bun oxc:write` with explicit owned-file paths. Read-only commands are the default;
format writes are intentional. Existing Biome CI/editor/generator ownership remains
until a workspace records rule coverage, formatting deltas and compensating
validators. Do not run global formatters or the root-wide Vite+ migrator for a
single workspace. Run `node --test scripts/oxc.test.js` to exercise file scope,
symlink rejection, dialog linting and read-only formatting behavior.

Gradual Cloudflare adoption preserves request/session, API, storage, consent and
localization contracts. Domain modules and portable React components use injected
adapters rather than framework/runtime globals. Keep framework imports in explicit
adapter entrypoints and protect portability with import-boundary regressions.
Vite+ tooling does not convert Next.js routes/actions; paused TanStack Start remains
paused. See [adoption guidance](../../../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx)
for parity and Worker acceptance gates; builds stay in exact-commit CI.

## cf CLI migration boundaries

Prefer cf for operations with demonstrated parity, beginning with bounded read-only
inventory/observability and a Vite-native Worker pilot. Pin dependencies through
package-manager commands; verify cf authentication/account independently of Wrangler.
Review typed configuration and Vite mode resolution against existing resource
identities, routes, bindings, Durable Object migrations, triggers and secret names.
Keep one authoritative configuration per scope. Replace development, type generation,
CI artifact production, tail/version inspection and release/rollback separately;
retain Wrangler for unsupported operations. Exact-commit CI and real emitted-artifact
acceptance remain required. Do not run global migration or deployment as part of
planning. Follow the phased plan in the adoption guidance above and recheck
[upstream coverage](https://blog.cloudflare.com/cloudflare-cf-cli-launch/) before edits.

Execute cf with Node22.18+ even when Bun installs dependencies; typed-config
commands are not supported on Bun. Discover a reviewed exact version from private
scratch outside app config/.env ancestry before adding it to a workspace. Use
anonymous operation-only search queries, then focused command help/schema.
Require `cf auth whoami` JSON `authenticated === true`, not process exit0:
unauthenticated results can exit successfully. cf credentials are separate from
Wrangler. Stop authenticated parity work when access is absent; do not copy tokens
or login files. Account selection may write project cache, so verify identity and
local files. See [cf prerequisites](https://developers.cloudflare.com/cf/get-started/).

## Cloudflare runaway-work review

For added or amplified background work, review alarm/queue/cron feedback paths and
cost units before migration acceptance. Require durable attempt/age or lease bounds,
finite future deadlines, bounded operations per wake, no reschedule after terminal
state, idempotent progress and an authenticated persisted stop fence that covers
racing callbacks. Exercise duplicates, restart, no progress, repeated downstream
failure and shutdown with operation-count assertions in fixtures and real local
Workers; build and emitted-artifact checks stay in CI. Batch writes only with
verified billing semantics. Record cost assumptions, applicable alert delivery and
an independent operator response. Alerts and CPU limits do not cap total spend.
Do not copy upstream examples that deliberately retry forever into finite jobs.
See the adoption guidance's runaway-work acceptance table; live settings are
separate evidence, never implied by documentation or build success.

## Codex plugin native parallel pilot

`codex-plugin.yaml` has one native `parallel` group containing only the MCP and
orchestration-evidence unittest suites after Python setup, plugin validation and
the unchanged hash-locked dependency install. Preserve their discovery commands,
five-minute timeouts, 1 GiB per-process virtual memory ceilings and the implicit
failure-propagating wait. Keep docs JSON validation after the group and retain
the fifteen-minute job limit, read-only permissions, triggers and switchboard.
GitHub documents this syntax in its June 25, 2026 changelog and workflow syntax;
see the linked sources in the Codex plugin docs' CI Coverage section.

Run `node --test scripts/ci/codex-plugin-parallel-workflow.test.js` for structural
regression coverage. Qualification also needs automatic exact-head hosted suite
intervals proving overlap and completion. Local process concurrency is not proof
of native runner semantics. Do not claim speed without comparable measurements,
extend this pilot to deployment workflows, or replace the shared local resource
broker with shell fan-out. Revert the group to sequential children for rollback.

## Inactive runtimes until further notice

Docker setup, Rust, and TanStack Start are paused; the Docker cron runner is
retired. Keep `docker-setup-check.yaml`, Docker-backed E2E jobs, Rust/TanStack
workflows and direct deploy jobs disabled, including manual dispatch. Retain
policy tests but exclude inactive implementation suites from default discovery.
Root commands fail visibly rather than starting or refreshing those runtimes.
`bun update-all` explicitly targets maintained workspaces; Renovate ignores
paused app/Docker sources and broad lockfile maintenance stays disabled.
Shared lock resolutions still need review when active dependencies change.
Do not regenerate migration manifests as a condition of live Next.js work.
Resumption must restore commands, tests, CI, dependency policy and docs together.
See `apps/docs/build/devops/active-runtime.mdx`.

## File Size Ceiling

- Keep every new authored source file at or below the hard **700-LOC ceiling** in
  any language. Already-oversized authored files are grandfathered only while
  they do not grow and should shrink when substantially edited. Tests and
  migrations are authored source; generated and vendored files are excluded.
  Start splitting around ~400 LOC (~200 for components/widgets) as review
  guidance, extract cohesive submodules, and keep import paths stable with thin
  re-exports (`pub use`/barrel files).
- Rust backend specifics (`apps/backend`): the crate root is split into
  `src/dispatch/` (one `dispatch_chunk_NN.rs` per route-table chunk) plus named
  helper submodules, each re-exported from `lib.rs` with `pub(crate) use
  <mod>::*;`; unit tests live in `src/tests.rs` (`mod tests;`). See
  `apps/backend/AGENTS.md` for the extraction pattern.

## Commands And Formatting

- Focused non-build tests needed to validate authorized work may run. Builds
  and setup-triggered builds run in CI only.
  Start long-lived development servers only when requested or needed for
  explicitly requested runtime verification. Deployment authority stays separate.
- For TypeScript, JavaScript, root scripts, or repo config changes, run focused non-build checks locally; do not run local `bun check`.
- Use focused package-local tests, then applicable exact-commit CI checks.
- Normally run the applicable check, lint, test, and build workflows in CI for
  the exact authored commit, then inspect their terminal results. A demonstrably
  stuck queue can defer this proof; record pending jobs and local evidence, and
  finish exact-commit CI before calling the change release-ready.
- For single-package validation, prefer package-local commands such as
  `bun --cwd packages/ai vitest run ...` instead of root commands that fan out
  through Turbo.
- Run `bun ff` for touched frontend/TS files when required, but do not format
  unrelated dirty files.
- If `bun ff -- <files>` still triggers repo-wide Biome behavior, use exact-file Biome commands and keep fixes scoped to owned
  files; require the applicable lint workflow in exact-commit CI.

## Root Scripts

- Root script tests belong in `node --test scripts/*.test.js` and should be
  wired into `scripts/check.js` when a new utility needs CI coverage.
- Translation automation should use `scripts/i18n-common.js` for app message
  discovery, nested key assignment, and stable JSON sorting. Do not add new
  hard-coded `apps/*/messages` lists to i18n scripts; use `bun i18n:add` and
  its bulk `--mode add|remove|replace` paths for translation key operations,
  and reserve manual JSON edits for broad prose rewrites or value-only updates.
- Agent workflow helpers such as `bun git-commit-window` should use ignored
  runtime state under `tmp/agent-coordination/`, expose focused subcommands,
  enforce a short 5-10-minute claim TTL, and include `node:test` coverage for
  conflict, stale-lock, and wait behavior.
- ANSI strip helpers in root scripts should use `new RegExp(...)` forms when
  Biome would otherwise flag control characters in regex literals.
- Literal `${...}` source checks should use regex or escaped forms, not plain
  string literals that trip `noTemplateCurlyInString`.
- Do not remove caching, fail-fast behavior, or security validation silently;
  document the rationale when tooling behavior changes.
- `bun rust-cache report|prune|auto` is the repo-owned Rust target cleanup
  wrapper. It owns only `apps/backend/target` by default, stores auto-run state
  under ignored `tmp/rust-cache/state.json`, skips CI unless explicitly enabled,
  and keeps hot target data warm by pruning only stale or size-pressure entries.
  In long-lived or blocked worktrees, run `report` before handoff and use an
  explicit `--max-size`/`--max-age-days` bound when storage pressure is real.
  Inspect branch/worktree state first; prune rebuildable target artifacts, never
  source or an unmerged worktree. Confirmed-merged worktrees should be removed
  after main-green, `bun git-sync`, and production verification so their target
  caches disappear with them.
- Turborepo build outputs may include production `.next/**`, but must exclude
  volatile Next caches such as `.next/cache/**` and `.next/dev/**`. Next 16.3
  enables the Turbopack build filesystem cache locally through the shared Next
  config; keep that cache out of generic Turborepo outputs and use an explicit
  CI cache policy if it ever needs remote reuse. The `.next/dev` tree is local
  dev-server state; archiving it can capture multi-GB Turbopack caches and slow
  `bun dev:web` compilation.
- Before guessing at slow `apps/web` local compilation, run
  `bun diagnose:dev:web`. Use its cache-size, slow-filesystem-warning, and
  `.next/dev/trace` output to decide whether the next fix is cleanup,
  filesystem placement, or import-graph reduction.
- If diagnostics show `Watchpack Error (watcher): Error: EMFILE`, fix the dev
  launcher or shell open-file limit first. The default web dev wrapper raises
  the child process limit with `TUTURUUU_DEV_MAX_OPEN_FILES=65536`; set the env
  var to another positive value or `0` to disable the wrapper behavior. Native
  local dev leaves `WATCHPACK_POLLING` unset by default for faster, lower-memory
  watcher behavior; set `WATCHPACK_POLLING=true` only when a local filesystem or
  container workflow needs polling.
- `bun dev:web` is the lean web-only launcher by default. It skips
  `@tuturuuu/types` and `@tuturuuu/supabase` watch builds unless the caller
  passes `--with-shared-watchers`; use that opt-in only while editing those
  package sources and needing live `dist` rebuilds.
- `apps/web` does not mount React Query Devtools in the default development
  provider. Keep it out of the always-mounted provider graph; add a temporary
  local mount only for query-cache debugging and remove it before handoff.
- Keep the `apps/web` public shell compile graph lean. Mobile-only menu drawers,
  marketing footer bodies, report-problem dialogs, and authenticated-dropdown
  only UI should stay behind dynamic imports where practical, and shell icons
  should use `@tuturuuu/icons/lucide-static` instead of the root icon entrypoint
  or broad `@tuturuuu/icons/lucide` barrel. Protect these split points with
  compile-graph tests when changing shell code.

## CI And Dependency Drift

- Keep workflow Bun versions aligned with the repo `packageManager` pin.
- Workflows that need Bun should use
  `.github/actions/setup-bun-with-retry` instead of `oven-sh/setup-bun`
  directly. The local action downloads the pinned Bun release with bounded
  exponential backoff so GitHub release 5xx failures do not immediately fail
  deploys.
- Workflows that need the Supabase CLI should use
  `.github/actions/setup-supabase-cli-with-retry` after checkout. The wrapper pins
  setup-cli v3.0.1 by commit SHA and resolves the database workspace's exact stable
  CLI from the repository-root `bun.lock`; missing or invalid pins fail before
  installation. An explicit override must also be an exact stable version.
  No GitHub token input is needed by v3. Keep Node 20+ and npm available first.
  The installer uses a runner-temporary home because its setup-bun ignores
  `BUN_INSTALL`. After every attempted installation, the wrapper verifies any
  pre-existing Bun binary and prepends its directory for subsequent steps.
  Four attempts use 5/10/20-second backoff; exhausted retries fail the job.
- Release Please is the monorepo source of truth for version/changelog PRs.
  Keep `release-please-config.json`, `.release-please-manifest.json`,
  `.github/workflows/release-please.yaml`, and `tuturuuu.ts` aligned when
  changing release automation. Do not reintroduce checksum or PR-title package
  version bump generators.
- Use `bun git-release-please` from a clean `main` checkout to merge the latest
  `release-please--branches--production` branch. The helper fetches the bot
  branch, merges without committing, syncs the platform badge version files from
  `platform-version.txt`, runs `bun ff`, stages the resolved merge, then runs
  `bun check` directly before the merge commit lands. If the staged release
  merge includes `apps/mobile` paths, the helper also runs `bun check:mobile`.
  If a manual merge is already in progress, run
  `bun release:sync-platform-version` before staging the resolved
  `TUTURUUU_PLATFORM_VERSION` files.
- A CI job that runs `bun check` (or any turbo `test` task) on a fresh checkout
  must first build the dist-only packages, the way `codecov.yaml` and
  `release-please-auto-merge.yaml` do:
  `bun turbo:local run build --filter=@tuturuuu/types --filter=@tuturuuu/supabase
  --filter=@tuturuuu/masonry --filter=@tuturuuu/internal-api --filter=tuturuuu`.
  The turbo `test` task dependsOn `transit`, a no-op marker, **not** `^build`, so
  nothing else produces `dist/**`. Locally this is invisible because `bun setup`
  builds exactly those packages; in CI, `bun install` alone leaves 24 packages
  failing with `ERR_MODULE_NOT_FOUND`. Those packages expose only built
  entrypoints to Node resolution — `@tuturuuu/supabase` points its `bun`
  condition at source, but vitest resolves under Node conditions, so that does
  not help. Route the build through
  `.github/actions/run-with-turbo-remote-cache`; `ci-cache-policy` rejects a
  bare `run:` for cacheable turbo tasks.
- For a CI-only failure, reproduce the affected non-build test with `CI=true`
  and an explicit environment. Require exact-commit clean-checkout CI for build
  or dependency-output failures; never run local `bun check` or delete shared
  `packages/*/dist` to simulate CI. Stale local outputs can conceal missing
  build prerequisites, so inspect the actual CI dependency graph and logs.
- Tests must pin any environment they depend on rather than inheriting the
  runner's. `scripts/setup-portless.test.js` injected `isTTY`/`log`/`runner` but
  let `env` default to `process.env`, so it passed locally and failed under
  `CI=true`. Pass an explicit `env`.
- New `scripts/*.test.js` files must be added to the `test:scripts` list in
  `package.json`; a test file that is not listed never runs and is not coverage.
- Keep the Release Please token fallback ordered as
  `secrets.RELEASE_PLEASE_TOKEN || github.token`; the bot token is still needed
  for generated PRs and releases to trigger downstream workflows.
- `RELEASE_PLEASE_TOKEN` must be a PAT (`repo` + `workflow`) owned by an
  organization admin. Ruleset `Protected branches` covers `main` and
  `production` with only `OrganizationAdmin` as a bypass actor, so a run that
  falls back to `github.token` merges fine and then dies on
  `GH013: Changes must be made through a pull request`. Do not "fix" this by
  giving the Actions app a ruleset bypass: `GITHUB_TOKEN` pushes do not trigger
  `push` workflows, so the `production` push would skip the Vercel production
  planner and the next Release Please run. Gate any workflow that will push
  protected branches on the secret being present, before the expensive steps —
  discovering it after `bun check` wastes ~40 minutes per run.
- Any CI job that runs `bun git-release-please` needs a Flutter toolchain
  (`subosito/flutter-action@v2`, pinned to the same version as `mobile.yaml`,
  plus `flutter pub get` in `apps/mobile`). Release Please bumps
  `apps/mobile/pubspec.yaml` on every release, so `touchesMobile()` is always
  true and `bun check:mobile` always runs; `flutter pub get` also covers the
  `generate: true` gen-l10n step that `flutter-analyze` needs.
- Exclude `release-please--branches--**--release-notes` metadata branches from
  Biome's native push trigger, while preserving validation for real release PR
  branches and manual dispatch. Overflow branch creation briefly reuses the
  production SHA; cancellation on its next push otherwise marks main/production
  red too. Verify all check runs on the release SHA, not only branch-filtered runs.
- Keep the Release Please overflow recovery step before
  `googleapis/release-please-action@v5`. It runs
  `node scripts/ci/release-please-overflow-recovery.js --target-branch production`
  to recreate a missing `release-notes.md` companion branch when a merged
  pending release PR body points at an overflow notes file that GitHub no longer
  has.
- Route workflow `bun install` and `bun setup` steps through
  `bash scripts/ci/run-with-backoff.sh ...`. The helper uses bounded
  exponential backoff and clears `bun pm cache rm` between Bun-command attempts
  before changing dependencies when the failure is a tarball extraction or
  cache issue.
- Coverage workflows may also route long `bun turbo:local run test -- --coverage`
  commands through `scripts/ci/run-with-backoff.sh` when logs show a transient
  runner interruption such as exit code `130`. Keep the retry cap low, normally
  two attempts, so deterministic test failures are not obscured by repeated
  full-suite runs.
- Package release workflows are npm-only for now. Do not add JSR or GitHub
  Packages publish jobs, and do not wire `jsr.json` version files into Release
  Please while those registries are paused.
- Keep local Tuturuuu package dependencies on `workspace:*` in source
  manifests. Package release workflows must use workflow-level concurrency for
  `${{ github.workflow }}-${{ github.ref }}` and run
  `node scripts/ci/package-release-readiness.js gate-package-release packages/<name>`
  before build, pack, or publish work starts. The gate checks the package's own
  npm version and each publishable `workspace:*` dependency exactly once. When a
  dependency is missing from npm, the gate inspects the dependency package
  workflow for the same SHA; it dispatches missing dependency workflows once,
  defers green without sleeping when dependencies are pending, and fails fast
  when the dependency workflow failed or has unreadable status. A `success`
  conclusion does NOT imply the dependency was published: a deep chain triggered
  concurrently can have an intermediate workflow conclude green while deferring
  its own publish (the "deferred without occupying a runner" path). So when a
  dependency workflow succeeded but its version is still absent from npm, the
  gate treats it like a missing run — it re-dispatches that workflow and defers
  the current package rather than failing — guaranteeing forward progress and
  breaking potential deadlocks. The gate job needs `actions: write`; build, pack, and
  publish jobs must run only when `should_publish == true` and
  `dependencies_ready == true`.
  After the package is visible on npm, a separate non-OIDC dependent dispatch
  job may wake direct dependent package workflows, but it must not checkout the
  repo or carry publish authority. The internal
  `dispatch-dependent-workflows packages/<name>` command is available for
  direct/manual dispatches that can read the checkout; workflow jobs should use
  the release gate's precomputed `dependent_workflows` output when they need to
  stay checkout-free. `wait-workspace-dependencies` may remain as a compatibility
  command, but package publish workflows and docs should not use it for normal
  package releases. Before `npm pack`, run
  `node scripts/ci/prepare-npm-package-manifest.js packages/<name>` so packed
  artifacts contain concrete npm-compatible versions instead of `workspace:`
  protocol ranges. Package-included `file:` tarball dependencies must not remain
  as consumer-relative manifest ranges. Embed their vetted contents into the
  artifact, redirect the owning package export to those immutable bytes, and
  remove the install-time dependency edge; never replace the checked-in archive
  with a mutable external HTTPS tarball URL.
- After `npm publish`, package workflows must poll `npm view` for the exact
  published version before reporting success. First-publish `E404`, permission,
  or trusted-publisher errors should fail clearly and be fixed in npm package
  access/trusted publisher settings, not bypassed with tokens or skipped
  package publishes.
- If a release-please-managed package becomes a runtime dependency of another
  published package, add a matching npm release workflow and `tuturuuu.ts`
  switchboard entry for that dependency instead of letting consumers resolve an
  unpublished package name. Keep `@tuturuuu/ui`'s installed runtime
  dependency graph fully publishable on npm; if a UI-only edge points at a
  private package, remove it when unused or model it as an optional peer owned
  by the narrow export that needs it. File-backed dependencies such as UI's
  vendored SheetJS tarball stay local in source manifests. The prepared npm
  artifact must embed the archive contents and omit the consumer-facing `file:`
  dependency so npm and Bun can install it from any workspace; do not rewrite
  the dependency to a mutable external HTTPS tarball before `npm pack`.
- Platform Vercel production deployment should run
  `node scripts/ci/package-release-readiness.js gate-changed-package-versions`
  before dependency installation when release-please package manifests changed.
  The gate inspects only the checked-out latest commit instead of the whole push
  event batch, tolerates shallow checkout by fetching a missing base SHA before
  `git diff`, dispatches missing package release workflows for the same SHA,
  fails fast if a related package release workflow failed, and exits
  successfully with `packages_ready=false` while package releases are still
  queued or running. Downstream install/build/deploy steps must be skipped when
  packages are pending so the Vercel workflow does not occupy a runner while
  waiting for npm. The deploy job therefore needs `actions: write` for workflow
  dispatch recovery; keep npm publish authority isolated to package
  `publish-npm` jobs. Because a package-gate skip is still a successful workflow
  conclusion, the production planner must select the platform deploy for
  database changes. Production database migration gates must require both the
  successful planner run and `vercel-production-platform` deployment marker for
  the same SHA before running `supabase db push`. Reusable `workflow_call` jobs
  do not appear as standalone workflow runs, so migration gates query the
  planner run through the Actions API.
  Every active Vercel project must keep its root-Turbo `buildCommand` checked in.
  Generate deterministic source metadata first, then run `vercel build` through
  `.github/actions/run-with-turbo-remote-cache`; do not add a separate workspace
  dependency prebuild. Platform preview remains build validation only and may
  cross-credit successful same-SHA production build markers. Platform
  production must build and deploy prebuilt artifacts, then record both build
  and deployment markers. Satellite Vercel workflows still deploy prebuilt
  artifacts independently.
- Avoid reusable configuration jobs when the caller already has to allocate a
  runner. Platform preview resolves changed files and configuration inside its
  deploy job so the required protected-`main` workflow-run signal remains
  intact without a second runner. Trusted manual satellite previews run their
  ref/actor-guarded deploy job directly because manual dispatch already bypasses
  affected-path gating. A path-simple compatibility smoke may use native
  trigger filters instead; the external-app smoke runs only for
  `apps/external/**`, `packages/**`, or its build-control files.
- Keep automatic production Vercel deployments attached to the commit's push
  run: resolve affected apps once in the planner, then call selected per-app
  workflows through static `workflow_call` jobs. Reserve `workflow_dispatch`
  for manual recovery so commit CI remains traceable by SHA.
- Give every reusable production app workflow a static per-app concurrency
  prefix plus the Git ref. Reusable workflows inherit caller context, so a
  shared caller-derived key can cancel sibling deploys and turn intended skips
  into red X statuses. Keep serialized deployment/publication groups on
  `cancel-in-progress: false` and `queue: max` so active and pending runs survive
  newer pushes. Protected validation groups include SHA, event, and run identity;
  job-level duplicate proofs decide valid skips. Never combine `queue: max` with
  cancellation enabled.
- For explicitly authorized manual CI cleanup, inventory fresh protected refs
  and open PR heads, then protect `main` and `production` before testing merged
  PR branch membership. Historical promotion PRs can use `main` as their head;
  branch membership alone must never authorize cancellation. Pin current head
  SHAs, preserve their runs, and freeze eligible run IDs within the authorized
  scope. Keep per-run receipts and distinguish accepted requests from terminal
  cancellation. Any force phase needs explicit authorization, bounded remaining
  IDs and a bounded verification read, not polling or automatic batch expansion.
  Follow the [queue cleanup procedure](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#authorized-ci-queue-cleanup).
- Key preview concurrency by workflow and `preview_ref` and enable
  `cancel-in-progress`. This lets a newer protected-main platform signal or a
  repeated manual preview replace stale work without serializing unrelated
  preview refs behind the same group.
- Use GitHub's organization-managed `dynamic/github-code-scanning/codeql`
  workflow for automatic JavaScript/TypeScript and Python scans. Keep the
  checked-in `codeql.yml` manual-only so it provides an explicit fallback and
  satisfies the Security UI without duplicating push, pull-request, or cron
  runs.
- E2E uses a `**` push-path catch-all so unknown runtime inputs reach the
  planner, with explicit exclusions for known non-runtime apps, docs, and agent
  tooling. Fingerprints cover runtime, specs, shared packages, database,
  dependencies and runner controls. The input-keyed planner may reuse only exact,
  fresh passing protected-main proofs; missing or uncertain evidence executes
  tests. Never cache failures, flaky/empty reports, or branch-authored successes.
  Keep automatic E2E commit-driven with no cron and manual dispatch always full.
- Keep E2E requests aligned with current route ownership. When a spec exercises
  a satellite-owned API or UI, discover it from Playwright's shard-specific
  `--list` output, start only that satellite, and route the request through its
  Portless origin instead of relying on a removed proxy in `apps/web`.
- Gate Supabase migrations against a successful per-environment deployment
  marker and diff the entire pending range, not only the latest commit. Fail
  open without a trustworthy marker, keep staging/production jobs serialized,
  and combine evaluation with deployment so a no-op workflow-run signal uses
  one short runner. The production workflow-run trigger and Actions API lookup
  must follow the production planner; the same-SHA platform deployment marker
  and successful staging checks remain mandatory.
- Keep remote-cache values out of workflow/job environments and `GITHUB_ENV`.
  Pass them only to the composite wrapper's command step. Repository
  `TURBO_TOKEN` is for trusted jobs only; `TURBO_TEAM` is a repository variable
  with temporary secret fallback. Pull requests and Dependabot receive neither
  token nor team and use a task-family `.turbo` cache that only protected
  default-branch jobs may save.
- Only trusted `main` jobs may save the shared Bun runtime and package-download
  caches. Production, pull-request, Dependabot, and other branch jobs restore
  the default-branch entries without creating branch-scoped duplicates; this
  prevents each lockfile generation from consuming another roughly 1 GB on
  `production`.
- Hash output-affecting build, Vercel, Docker, and public runtime variables in
  Turbo. CPU, heap, and concurrency controls are pass-through values. Use a
  transit-only dependency task when downstream tests must invalidate on
  dependency source changes without executing dependency test suites.
- Artifact uploads must declare both retention and missing-file behavior.
  Consolidate failure diagnostics per shard or mode, keep package handoff
  tarballs for one day without redundant compression, and cache native
  dependencies instead of final Flutter deliverables.
- Standard public GitHub-hosted Linux/Windows jobs should budget for 4 CPUs and
  16 GB RAM. Default CPU-bound Turbo checks to concurrency 4; cap memory-heavy
  Next/Docker inner builds at 2 with an 8 GB Node heap. Keep independent jobs
  parallel within the organization-wide 20-job ceiling and no more than 5
  concurrent macOS jobs. Do not move cache optimization onto billable larger
  runners.
- Keep `actions-storage-report.yaml` read-only. Query the live repository cache
  maximum and retention, report prefix usage at 80/90/100 percent thresholds,
  and summarize artifact count/bytes/age without treating current public-repo
  storage discounts as an unlimited entitlement. Aim below 9 GB steady-state
  inside the currently configured 10 GB cache limit, and never automatically
  delete default-branch CodeQL caches.
- Package release workflows must use npm trusted publishing. Keep
  `id-token: write` isolated to the final `publish-npm` job, publish a downloaded and
  verified tarball with `npm publish --ignore-scripts`, and do not reintroduce
  `NPM_TOKEN`, checkout, Bun setup, dependency install, or package builds in the
  publish job. Run required lifecycle builds through the remote-cache wrapper in
  the preparation job, then use `npm pack --ignore-scripts` so `prepack` cannot
  silently rebuild outside Turbo.
- Workflow-published package manifests must include provenance-compatible
  `repository` metadata: `type: "git"`,
  `url: "https://github.com/tutur3u/platform"`, and `directory` equal to the
  package path. npm trusted publishing rejects an empty or mismatched repository
  URL with `E422` while verifying the sigstore provenance bundle.
- If local type-check passes but CI fails from stale incremental state, rerun
  with forced cache invalidation before changing unrelated code.
- Docker verification workflows should use `docker buildx build --load` plus
  shared `type=gha` cache scopes per service image. Give every scope one trusted
  `main` writer: Docker setup owns web, TanStack, development-web, and storage;
  Rust CI owns backend; E2E shard 1 owns leaf sidecars. Production, other E2E
  shards, and migration E2E restore only. Use `mode=max` for expensive web,
  TanStack, and backend scopes, and `mode=min` or restore-only caching for the
  validation-only development image and leaf images. Bound cache operations
  and tolerate cache-service errors. Docker Compose jobs must explicitly select
  a `docker-container` Buildx builder before using the GHA cache backend; the
  default `docker` driver rejects cache export. Pass Turbo remote-cache values
  as optional BuildKit secrets for build `RUN` steps; never bake those values
  into image layers, args, labels, or committed env files.
- Workspace packages with direct `tsc` build scripts must declare
  `typescript` in their own `devDependencies`. Filtered Docker
  installs such as the Hive production image do not install root-only dev tools,
  so package-owned build scripts cannot rely on the root `tsc` binary.
- Programmatic compiler API consumers must stay on the active TypeScript 7
  toolchain instead of carrying legacy compiler compatibility packages.
- Next.js apps that run `next build` must declare `@typescript/native-preview`
  while the repo uses the TypeScript 7 native compiler package. TS7 no longer
  exposes the classic `typescript/lib/typescript.js` file that Next probes
  during build-time TypeScript setup; the native-preview marker uses Next's
  supported native compiler path without reverting the repo to TS6.
- Do not patch unrelated packages just because `bun check` fails outside the
  owned scope. Run focused verification and report the blocker.
- Package subpath imports must be covered by the package `exports`; do not
  assume a directory `index.ts` is importable through a bare subpath. For focused
  source-only TypeScript checks, map each subpath to the source entry that
  produces its exported artifact (for example, `infrastructure.ts` rather than
  `infrastructure/index.ts`). Preserve the repository compiler flags, including
  `noUncheckedIndexedAccess`; a different barrel or weaker flags can hide CI
  failures. Exercise changed public helpers through that entry in regressions.

## Plugin Changes

- Keep `plugins/tuturuuu/.codex-plugin/plugin.json` aligned with the plugin
  folder name, but do not bump its `version` for ordinary authored work unless a
  release workflow or user request requires it.
- Keep skill folders aligned with frontmatter names and include
  `agents/openai.yaml`.
- Keep default prompts short, natural, and action-oriented.
- Keep public skills.sh metadata aligned with Tuturuuu skill folders:
  `.claude-plugin/marketplace.json` exposes `plugins/tuturuuu/skills`, and
  `skills.sh.json` controls the public grouping order. Do not move or rewrite
  `.agents/skills` just to publish the Tuturuuu plugin skills.
- Trigger skills.sh discovery only after the metadata commit is pushed to
  GitHub. Run `npx skills add tutur3u/platform ...` from a disposable directory,
  not from the platform checkout, so the install telemetry indexes the public
  source without rewriting local project skills.
- Run `python3 plugins/tuturuuu/scripts/validate_plugin.py` after plugin edits.

Release Please excludes the inactive TanStack Start package from release generation;
its historical manifest version remains frozen. Renovate also ignores the inactive
runtime and Docker workflow files, in addition to the paused source/Dockerfiles.
Policy tests guard these exclusions. Do not reactivate them indirectly during
ordinary active-package release maintenance.

## Cron Control native Worker toolchain

Use the owning Cron Control workspace and Node 24 for Vite+/Oxc commands.
Its independent unit config must not start the Cloudflare Vite development plugin.
Runtime health fixtures do not dispatch scheduled work or contact production;
repeat them against the CI-emitted configuration and verify identity, compatibility,
trigger, vars and secret names. Deploy only the immutable artifact qualified by
that CI run, using its emitted Wrangler config; preserve source config for named
secret provisioning. See `apps/docs/build/devops/cloudflare-cron-control.mdx` for
commands and the distinct downstream delivery/cost/stop acceptance boundaries.

## Vite+ native service Worker boundary

Give an adopted native Worker an owning private workspace, pinned Vite+/Cloudflare
plugin and a matching `vite` core alias when plugin peer types require it. Keep
Cloudflare dev/build configuration separate from unit-test configuration so root
Vitest discovery does not start Worker development servers. Use explicit scoped
JSON Oxc configuration; retain existing Biome gates during parity work. Generate
Worker types before checking source/config TypeScript. Build only in exact-commit
CI and test the emitted Wrangler configuration in addition to source fixtures;
dry-run and authorized deployment consume that same emitted target. Preserve
bindings, migrations, routes, secret names and active identity/protocol policies.
Assert each service's source compatibility flags rather than copying another
Worker's flags; Devbox Control intentionally has none.
Devbox Control's runtime script demonstrates disposable-credential denial tests;
those do not prove hosted Supabase, runner or WebSocket success. Follow the owning
runbook for commands and remaining acceptance, and keep local validation serialized.

Put native Worker test worker/pool defaults in `vitest.config.ts`, not the package
script. Shared sharded CI appends `--maxWorkers=2`; repeating that option in a
`vp test` script fails CLI parsing before collection. Validate new workspace test
scripts with `bun run test --maxWorkers=2` under Node 24 as well as their owning CI.

Vite+ 1.1.0 bundles Vitest 5.0.3. Align the root Vitest dependency, its override,
and coverage-v8 provider to that exact version with Bun commands. Updating only
the provider while a root override forces an older runner still mixes versions.
Validate the forwarded coverage command too: `bun run test --maxWorkers=2 --coverage`
under Node 24. Do not disable Vite+'s provider-version guard to unblock CI.
