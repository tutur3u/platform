# CI And Docs Checklist

Use this checklist when changing CI, validators, docs, or repo automation.

## Rollback And Mixed-Version Recovery

For Instant Rollback, incompatible satellite/API versions, or a rollout incident,
use `$tuturuuu-rollout-recovery` and its
[recovery evidence](../../tuturuuu-rollout-recovery/references/recovery-evidence.md).
Keep the current skill's workflow ownership and migration prerequisites; recovery guidance
does not authorize promotion.

## CI

- Inspect nearby workflows before adding a new one.
- Treat the repository Actions cache budget as shared with the Supabase image
  archives. Heavyweight Gradle, Flutter SDK/pub, Bun dependency and CocoaPods
  writers must have explicit trusted-ref/event guards; PRs restore only.
  `actions/setup-java` with `cache: gradle` registers an implicit post-job save,
  so use SHA-pinned `actions/cache/restore` plus a main-push-only save instead.
  Inventory every combined cache/save action and setup cache input, including
  combined `lookup-only` post saves, Rust save-if, Buildx binary defaults and
  declared BuildKit GHA exports. Keep paused-source classifications fence-checked.
  Allow exceptions only by exact workflow/job
  and full input set with a reason; do not infer safety from key names. Bun
  dependencies use a coarse v2 key per OS/architecture/pinned version without
  lockfile hashes or v1 fallback, preventing new archives on every lock update.
  Production mobile jobs restore main caches without unreachable save steps;
  desktop/release/employee Flutter callers use the restore-everywhere wrapper.
  Run `node --test scripts/ci/heavyweight-cache-budget.test.js` when changing
  cache behavior; see the CI runbook's repository cache budget section for
  bounded, operator-owned retired-version cleanup. A passing source guard does
  not prove hosted cache retention.
- Use `.github/workflows/ci-check.yml` when the workflow should respect the repo-level `tuturuuu.ts` switchboard.
- Add the workflow filename to `tuturuuu.ts`.
- Prefer `permissions: contents: read` for validation-only jobs.
- Prefer standard-library validators for plugin, docs, and repository metadata checks.
- Keep path-sensitive checks deterministic and run them from the repo root.
- Keep staging and production Supabase migration CI on
  `supabase db push --include-all`; production migration CI stays
  triggered by the production deployment planner and prerequisite-gated on the
  production platform deployment marker plus exact-source staging proof. Bind the
  newest canonical marker and latest status to the current successful producer
  attempt and its successful checkout/apply/marker steps; wrapper heads may differ.
  Verify allowlisted, rehashed producer/emitter contracts at target and wrapper, use bounded
  complete inventories, and reread after inspection. Unknown evidence denies migration.
  Keep the verifier inline when old target checkouts lack new helpers. Database
  migration paths must select the platform deployment so that marker exists.
  Every enabled admitted staging target must apply and emit its exact-target marker,
  including app-only commits. Read the authoritative checkout-local `ci` boolean
  without path gating or new helpers; explicit false disables staging. Mixed reviewed
  producer contracts are allowed; unknown contracts and skipped apply still deny.
- The production planner deploys app code before the production migration runs.
  Any app change that reads or writes a new column must remain compatible with
  the old production schema during that interval. A green staging migration or
  successful Vercel deployment is not proof that the production migration job
  ran: inspect the `Migrate production database` job and applied migration log.
  If an incompatible build reaches production first, roll back only the affected
  app, then test its new deployment against the migrated database before
  promoting it again. Do not roll back an applied migration file.
- Keep `vercel-preview-platform.yaml` on a protected `main` push trigger because
  `supabase-staging.yaml` depends on its completed workflow-run event; other
  preview Vercel workflows remain trusted manual-dispatch only.
- Keep the platform preview affected-path decision inline in its deploy job so
  every protected `main` push still emits the staging workflow-run signal
  without allocating a second runner. Manual-only satellite previews should
  launch their guarded deploy job directly and must not add a redundant
  reusable `check-ci` job.
- Keep commit-driven production Vercel deployments under the production
  planner's push run. Call selected per-app workflows through `workflow_call`
  and reserve `workflow_dispatch` for explicit operator reruns.
- Document and test a unique static concurrency prefix for every reusable
  production app workflow; caller-derived shared keys can cancel sibling jobs
  instead of leaving unselected jobs cleanly skipped.
- Keep serialized deployment/publication groups on `cancel-in-progress: false`
  with `queue: max`; disabling active cancellation alone still replaces the
  default single pending run. Ordinary main/PR validation supersedes older runs;
  production and release-please pushes retain non-cancelling SHA/run/attempt
  groups, as do reruns and dispatches. Preserve explicit deployment and paused
  runtime exceptions. Never combine `queue: max` with cancellation enabled.
- When changing concurrency, search workflow-reading tests outside `scripts/ci`
  as well as the root suite. Database contract workflows run their own Node
  tests; root script discovery does not include all of them. Verify behavior
  across events, refs, SHAs, run IDs and attempts, retaining negative controls.
- Keep preview concurrency keyed by workflow and `preview_ref` with
  `cancel-in-progress: true`; repeated requests for one target should replace
  stale runs without canceling a distinct preview ref.
- Prefer native trigger paths for a broad compatibility smoke only when its
  contract is intentionally path-simple. The external-app internal-package
  smoke owns `apps/external/**`, `packages/**`, and its build-control files, so
  unrelated app-only commits should not create that workflow at all.
- Keep automatic CodeQL in GitHub's organization-managed
  `dynamic/github-code-scanning/codeql` workflow. Keep `codeql.yml` as a
  manual-only JavaScript/TypeScript and Python fallback with no push,
  pull-request, or cron triggers.
- Keep E2E commit-driven, with a broad `**` push filter and explicit known
  non-runtime exclusions and manual full dispatch; do not add a cron. Plan suites
  before
  allocating heavy jobs. Omit a suite only for exact input-keyed passing evidence
  from protected main, within its freshness window. Unknown inputs or cache/API
  failures run tests. Branch runs, flaky/empty reports, and failures cannot
  publish trusted successes. Keep cleanup and diagnostics for executed suites.
- Resolve Supabase migration changes from the last successful environment
  marker, fail open when that marker is unavailable, and serialize one combined
  evaluate-and-migrate job per environment. Production must retain its same-SHA
  platform deployment marker and successful staging prerequisite.
- For repo-local Codex plugins, keep `.agents/plugins/marketplace.json` present and pointed at `./plugins/<plugin-name>`.

## Meet Dry-Run Artifact Scratch

Keep both frontend dry-runs in `meet-cloudflare.yaml` routed through
`scripts/ci/meet-dry-run-scratch.mjs`, run from `apps/meet` with `"$SOURCE_SHA"`.
It derives config from `verify-meet-start-output.js`, requires the manifest and
strict canonical directory seal, and records preabsence of the emitted config
parent's `.wrangler/tmp` and `.wrangler`. It retains the existing app-owned
Bun/Wrangler arguments, cwd and environment and waits for child close.

A successful Wrangler dry-run may leave only empty scratch ancestors. Admit no
residue or exactly `.wrangler/tmp` with an empty leaf; verify the original files
and complete directory layout before nonrecursive leaf/parent `rmdir`, then
reverify the manifest and strict seal. Failed commands preserve status and
residue; preexisting, partial, nonempty, symlink, special or unexpected layouts
fail closed. Preserve evidence rather than retrying or recursively cleaning.
Never widen the hidden allowlist, permit SDK working directories on originals,
or exclude entries from the tar. Keep the credential-free restored gate free of
new dry-runs/builds and retain all launcher assertions and deadlines.

Require exact-commit producer dry-run, pack/restore and original/restored runtime
acceptance separately from static review. A file-only manifest passing cannot
prove directory-layout acceptance. See the Meet application page for the owning
artifact procedure; this wrapper does not qualify hosted behavior or deployment.

## Calendar Native Delivery Preparation

- Keep Calendar validation in the registered `mail-calendar-tasks-builds.yaml`;
  root selector/registry changes require parent ownership. Use exact PR-head or
  push-SHA checkout, Bun 1.4.4 and Node 24.22.0.
- Discover the official emitted Void deploy pointer (`configPath`, required empty
  `auxiliaryWorkers`), then validate contained main/assets/config before Wrangler
  type generation or dry-run. Generate `CloudflareEnv` with runtime types excluded;
  type-check the native entry and affected Web/Tasks consumers.
- Seal exact source and all emitted bytes, restore the same-run immutable artifact
  without rebuilding, and repeat dry-run plus mandatory emitted-Worker and offline
  acceptance. Keep `.runtime.mjs` artifact suites outside source-only discovery.
- Never infer hosted identity from Calendar's proposed source name. Keep native
  Cloudflare publication absent and Vercel native-source guards in place until
  observed account/Worker/domain/bindings/secrets, signed-in EN/VI/permission/
  offline/drain/provider acceptance and immutable Vercel rollback are recorded.
  Parent alone selects one publisher; Calendar does not inherit Meet's exception.
- Missing emitted schema, dependency or signed-in route fixture is an explicit
  acceptance gap. Authored tests and source review do not qualify runtime.

## Docs

- Add new docs pages to `apps/docs/docs.json`.
- Mention exact validator commands next to the system they validate.
- Document known local dependency requirements instead of hiding them in CI.
- Document restart or install steps when Codex must rediscover local plugin marketplace metadata.
- Keep docs focused on operational behavior: what to run, where files live, what the check catches, and what to do when it fails.

## Verification

- Run changed validators locally.
- Parse touched JSON with `python3 -m json.tool`.
- Run `bun ff` on touched docs, scripts, config, and workflow files.
- Run `git diff --check`.
- Run `bun check:changed` before pushing; when root TypeScript config or repo-wide
  script/config behavior changed, require `bun validate` to pass in CI for the exact
  commit (never run it on agent machines).
