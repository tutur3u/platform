# CI And Tooling Patterns

For root scripts, CI workflows, plugin validation, formatting and repo verification.

## Incremental Oxc and Worker adoption

Use root-pinned Oxlint/Oxfmt through `bun oxc:lint`, `bun oxc:format` and
`bun oxc:write` with explicit owned-file paths. Read-only commands are the default;
format writes are intentional. Existing Biome CI/editor/generator ownership remains
until a workspace records rule coverage, formatting deltas and compensating
validators. Do not run global formatters or the root-wide Vite+ migrator for a
single workspace. `scripts/oxc.test.js` covers file scope, symlinks and read-only formatting.
Colab's local Worker preview uses `vite.worker.config.ts`; keep its existing
configuration/persistence, disable remote bindings and require the CI preview runtime check.
Publication remains separate.

Preserve session, API, storage, consent and localization contracts. Portable domain/UI
modules use injected adapters; keep framework imports in explicit entrypoints
Enforce import boundaries; Vite+ does not convert routes/actions or resume paused runtimes. See [adoption guidance](../../../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx)
for parity and Worker acceptance gates; builds stay in exact-commit CI.

## cf CLI migration boundaries

Target: cf + Void (Vite+), adopted per verified operation while retaining existing
commands until parity. Wrangler gaps remain in the shrink-only
`scripts/ci/wrangler-usage-allowlist.json`, enforced by
`scripts/ci/wrangler-usage-guard.test.js`. Lower or delete an entry in the change
that removes usage. Count executable occurrences separately from mention lines,
including multiple invocations per line. Changed Wrangler-line hashes, growth and
changed gap scope need a fresh structured `admitted` PR decision and reason. Native Workers
use `cloudflare.config.ts` + `@cloudflare/vite-plugin` `newConfig.cfBuildOutput`,
Build Output identity parity (`scripts/ci/cf-worker-parity.mjs`), runtime checks via
`scripts/ci/cf-vite-worker.mjs`, and `cf deploy --prebuilt --no-provision`
(`--provision` defaults to true). See the
[parity matrix](../../../../../apps/docs/build/development-tools/cf-cli-wrangler-parity.mdx)
for per-operation verdicts, rollback and the cutover checklist. Run
`node --test scripts/ci/cf-vite-worker.test.mjs` for disposable-secret refusal
and environment-restoration regressions without starting a real Worker. Require
fixtures for all declared secrets, mask declared text bindings from the shell and
retain only the first prior environment value. Deploy settings snapshots must
pass before publication and after it; DO publication remains Wrangler until a
separately reviewed rehearsal receipt permits cf. The retained publisher validates
its source migration tags against the artifact, checks every ES module stays in
the qualified bundle and invokes Wrangler without rebundling. Runtime fixtures
allocate one temporary persistence directory per run, retain it across restarts,
and remove it on failure/close; never reuse the app developer state directory.

Coordination's before/after token gates consume the verified snapshot's `secrets`
array; avoid duplicate CLI reads. Settings tokens need Workers Scripts read on the
pinned account and Zone/Workers Routes read on every zone; narrow visibility hides routes. Keep the bounded fail-closed checks and see
the parity runbook's permission table. The usage inventory scans tracked executable
files in `tmp/` but excludes `.md`/`.mdx`/`.txt` everywhere, including runnable docs.

Drift-relevant settings list readback follows at most eight pages (50 entries per page) inside
the existing 28-request budget; inconsistent or repeated pages fail closed.
Object endpoints may carry list envelope metadata without being paginated.
Deployment history is the explicit exception: Cloudflare defines its first
entry as the current deployment. Capture only its id and complete valid traffic
split from page one; reject missing/invalid current state rather than searching
history. History length must not block publication. Preserve complete secrets,
domains and routes and exact schedule comparison; see the parity runbook's
deployment-history exception and twenty-page regression.
Keep endpoint diagnostics free of response text and preserve zone ordinals.
Planner recovery needs a new production SHA containing a script fix; an old
run reuses its triggering SHA. See the parity runbook and settings regressions.

Prefer cf for operations with demonstrated parity, beginning with bounded read-only
inventory/observability and a Vite-native Worker pilot. Pin dependencies through
package-manager commands; verify cf authentication/account independently of Wrangler.
Review typed configuration and Vite mode resolution against existing resource
identities, routes, bindings, Durable Object migrations, triggers and secret names.
Keep one authoritative configuration per scope. Replace dev, types, CI artifacts, tail/version inspection and release/rollback separately;
retain Wrangler for unsupported operations. Exact-commit CI and real emitted-artifact
acceptance remain required. Do not run global migration or deployment as part of
planning. Follow the phased plan in the adoption guidance above and recheck
[upstream coverage](https://blog.cloudflare.com/cloudflare-cf-cli-launch/) before edits.

Execute the pinned cf CLI with a Node version satisfying its package engines
(`cf@1.0.0-beta.20`: `^22.23 || ^24.22 || ^26.12`); Bun cannot run typed-config commands.
The older discovery minimum does not suffice. Native scripts use typed config and `.cloudflare/types/index.d.ts`.
Calendar's `calendar-cf-types.mjs` emits ASSETS-only template declarations after cf/artifact checks; keep fixtures/restores under Calendar for isolated dependency lookup and read verified descriptors rather than checked paths.
`calendar-cf-output.mjs` companion compares sealed ESM/assets and tar-preserved restored output.
Manifest-listed hashed server `.css` and `.woff2` files enter static assets only after source-hash and duplicate-client-byte checks; orphan or unknown server files fail closed.
Retain publishers until upload-name/runtime parity, and the types CI oracle until qualification.
Use anonymous operation-only queries outside config/env ancestry. Discover help/schema; require `cf auth whoami` JSON
`authenticated === true`; unauthenticated results can exit zero. cf credentials
are separate: stop when access is absent; never copy tokens or login files.
Account selection may write project cache; verify identity and resulting files. See [cf prerequisites](https://developers.cloudflare.com/cf/get-started/).

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

For Turbo cache admission, `budget-v2` in the global DO is the single durable
authority. Use one storage transaction for each reservation/admin mutation and
commit before artifact access. Never use R2 snapshots, isolate memory or an
eventually consistent cache as positive admission authority. Preserve committed
charges after unknown outcomes; do not retry reservations or refund failed
artifact work. Denials and unchanged admin actions perform no writes. There are
no R2 control writes or background checkpoint jobs, avoiding the same-key write
limit. Legacy `_control/budget-v1` is read only on explicit first initialization;
disable/drain the previous revision and reconcile unknown writes before import.
Never reset lost usage to zero or delete DO state as recovery. Count artifact
operations, DO/rate-limit calls and separate DO storage costs. Denied ingress and
failed attempts remain traffic-dependent costs requiring the independent mode-off
stop. `apps/turbo-cache/src/{stop-regression,budget-integrity}.test.ts` cover
failure/unknown outcomes, delayed legacy writes after stop, restart, burst 429s,
concurrency and maximum batches. The nonpublishing
`turbo-cache-cloudflare.yaml` / `build-acceptance` job must build the exact PR
head without compiled-artifact caches and exercise source and emitted Workers in
workerd. The shared cf harness uses disposable secrets and isolated persistence;
it verifies default-off, transactional initialization and stop/restart. Keep
hosted enabled-traffic/cost acceptance separate from local-runtime evidence.

## Cloudflare backend ownership guard

New crons, queues, schedulers and heavy/long-running backend work go to Cloudflare
(Cron Control Cron Triggers, Queues, Workflows, Durable Objects) under the
runaway-work review above. `scripts/ci/cloudflare-backend-ownership.test.js` fails
on a new Vercel cron, enabled cron-catalog job, live pg_cron job, post-cutoff
`cron.schedule`, Supabase Edge Function, Trigger.dev config/dependency/import, Next
`after()` import or `/api/cron` route. A cadence change counts as a new owner.
Legacy owners live in the shrink-only allowlist with owner/target/plan; the test
pins the adopted baseline and fails stale entries, so delete an entry when its
legacy definition is removed. Retained pg_cron jobs need a written pure-database
justification; `pg_net` callers are not exceptions. Do not extend the baseline to
admit new work. See `apps/docs/build/devops/cloudflare-backend-ownership.mdx`.

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

## Heavy CI admission
Use `PR_LABEL_GATE` for all PR actors/events. Heavy push triggers allow only
protected refs and retained `release-please--branches--**` selectors, never feature
branches. `pr-label-gate.test.js` covers both; keep release triggers/concurrency intact.

## Workflow token permissions

Declare `permissions: contents: read` (or `{}`); grant writes per job. The repo
default token is write-all. `check-ci` callers need `{contents: read, deployments: read}`.
`workflow-permissions.test.js` checks defaults, write allowlists and callee grants.

CodeQL PR uploads are diff-filtered; zero uploaded results do not clear the
local SARIF gate. Triage at the analyzed SHA and current main: trace validation
rejections, same-descriptor reads and directory-only fsync before calling an alert real.
Keep optional-reader defects distinct from default production reachability; test
replacement negatives without enabling collection. The gate prints escaped rule IDs
and locations, omits messages, and fails closed without a baseline. See [`security-cadence.mdx`](../../../../../apps/docs/build/devops/security-cadence.mdx). Definer policy, read-only daily inventory, historical exceptions and focused checks live in the [security scans runbook](../../../../../apps/docs/build/devops/security-scans.mdx).

## Bun runtime pins

The maintained toolchain uses Bun `1.4.4`. Keep active workspace `packageManager`
metadata, CI setup/action defaults, bootstrap fallback and SDK qualification
expectations aligned when changing the stable runtime. Use `bun pm pkg set` for
manifest metadata. Preserve historical observations, intentional version fixtures
and paused runtime source. Repository pins do not establish installed host or
fleet versions; verify those separately before claiming runtime acceptance.

## Commands And Formatting

- Focused non-build tests needed to validate authorized work may run. Builds and setup-triggered builds run in CI only. Start long-lived development servers only when requested or needed for explicitly requested runtime verification. Deployment authority stays separate.
- For TypeScript, JavaScript, root scripts, or repo config changes, run focused non-build checks locally; do not run local `bun validate`.
- Run `bun check:changed` before every push. It maps changed paths to Biome, branch-name, generated-inventory, guard, related-test, affected type-check and Flutter checks without builds, queues heavy steps through ttr, and treats cold-`dist` type errors outside changed files as advisory. Missing imports never demote real changed-file errors such as TS2322; only implicit-any follow-ons may be softened. Shared packages select reverse dependents; root/shared configs explicitly require CI. Hook mode refuses dirty tracked content and untracked inputs in selected workspaces/reverse dependents and parent directories of selected script tests. Git paths are NUL-delimited; reject only option-like repository/workspace-relative prefixes, preserving internal dash route directories. Shared config coverage notices include Bun/npm, root Vitest and Oxc configs. Extend `scripts/check-changed/plan.js` with tests when a new cheap CI failure class appears; see [pre-push checks](../../../../../apps/docs/build/development-tools/pre-push-checks.mdx).
- Partition related tests by runner before planning commands. Parse runtime imports from syntax with the pinned root parser; fixture strings, template text, comments, regular expressions and type-only imports must not select a runner. Actual `node:test` imports or the owning package's `node --test` script select native tests; explicit runtime Vitest imports override that package default. Cover both directions and the SDK portable-build fixture in `scripts/check-changed-runners.test.js`. Never send the same file to both runners or suppress real failures as empty discovery. Hook mode validates every pushed branch destination from Git stdin; without push refs, local `tmp/` branches may validate a configured tracking branch, printing both names; untracked temporary branches and ordinary invalid local names still fail. Published branch names remain CI-gated.
- tsrs (Rust TypeScript port) is advisory only: the gate defaults to tsc until seeded-error qualification, and explicit tsrs runs always retain tsc confirmation. Gate each project through TSRS_PROJECTS and print exact diagnostic-key differences as advisory output even when tsc passes. Resolve tsrs only for plans including a qualified project, disable npm lifecycle scripts, and use only an existing TSRS_BIN in hook mode, and `tsrs-shadow.yaml` records main-push parity. Keep `tsc` as the required gate until the [promotion criteria](../../../../../apps/docs/build/development-tools/tsrs-shadow-type-check.mdx#promotion-criteria) hold; tsrs currently tracks TypeScript 7.1 semantics and lacks `--showConfig`.
- Use focused package-local tests, then applicable exact-commit CI checks.
- Make nested CLI fixtures provide private Bun, bunx and Node launchers; CI's Bun bootstrap installs only Bun. Keep `resources-test-fixtures.ts` outside portable SDK staging as well as the no-emit type-check input, so fixture hooks never become public dependencies. Qualification controls must cover the actual source closure and both process-helper source/test workflow triggers.
- Standalone chat qualification uses verified Node 24.21.0 plus the source Vitest entry directly. Preserve original exit/signal/timeout/group and report gates; passing Web reports or an optional diagnostic comparison never override failure. Require fresh exact-source SQL197/Web9/Dart9 with fixture/database cleanup; see the [CI runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx).
- Normally run the applicable check, lint, test, and build workflows in CI for the exact authored commit, then inspect their terminal results. A demonstrably stuck queue can defer this proof; record pending jobs and local evidence, and finish exact-commit CI before calling the change release-ready.
- For single-package validation, prefer package-local commands such as `bun --cwd packages/ai vitest run ...` instead of root commands that fan out through Turbo.
- Run `bun ff` for owned frontend/TS files when required; if it triggers repo-wide Biome behavior, use exact-file Biome commands. Preserve unrelated dirty files and require the applicable lint workflow in exact-commit CI.
- For nested Biome configs, reproduce with the pinned executable and authentic generated bytes: Biome 2.5.13 rebases inherited root `files.includes` globs under the extending config, so root `!apps/meet/src/routeTree.gen.ts` can miss the file. In Meet and Calendar, use owning `formatter.includes: ["**", "!src/routeTree.gen.ts"]`. Preserve supplier bytes and generated casts; do not format or hand-patch generated source, disable types, or add global waivers. Compare before/after generated exclusions and authored/Worker negative controls; preserve linter settings and inactive-runtime scope. Fixture skips prove exclusion only, not lint/type/build/full CI or runtime acceptance; retain raw failures and protocol NOTPASS separately.

Keep Vite/Void host configuration in its own TypeScript program when tooling
loads runtime globals such as Bun's augmented fetch. Mail, Calendar and Meet
use `tsconfig.config.json`, checked by the normal package `type-check` gate.
Retain every app/test root and the separate host-config check. Run
`scripts/ci/vite-config-type-boundary.test.js` and inspect `tsc --listFilesOnly`
when diagnosing ambient-type leakage; do not patch mocks to satisfy host globals.

## Validation job relevance

Mail/Calendar/Tasks uses `ci-check`'s `affected_jobs` JSON to gate named jobs
before allocating runners. Keep existing check names and commands. Compute each
build's transitive workspace closure; Calendar's group also owns Web, Tasks and
Tasks UI consumer checks plus restored-artifact acceptance. Include Infrastructure
and its dependencies for Calendar diagnostics that directly import its gateway. Unknown/missing
manifests or ranges, root/tooling inputs and manual dispatch run all jobs. Only
`plugins/tuturuuu/skills/**/*.md` and `apps/docs/**/*.{md,mdx}` prose is ignored
before evaluating the build closures. Skip
only explicit boolean false; absent outputs must run. Retain both source and
destination paths in rename diffs (`--no-renames`), and preserve failed-preflight
propagation. Run `scripts/ci/mail-calendar-tasks-affected.test.js`, changed-file
resolver, Calendar workflow contracts and the protected concurrency/config tests.

Rank CI changes from timestamped run/job inventories; state sampling and incomplete runs.
Separate scheduling, prerequisites, execution, archive restores and Turbo task hits.
Replay historical ranges; final PR files may differ. Keep projected and observed savings separate.
For required checks use job-level gates, never workflow paths/paths-ignore. Test's
`test-docs-only-gate.js` defaults to code on unknown ranges and every push; docs-only
PRs skip only test/coverage shards and coverage upload. Root script tests remain
ungated by the classifier and their failures always fail the unit summary, including
for docs-only diffs. Docs-only summaries require successful classification and
`skipped` heavy dependencies; failed, cancelled or missing results are not skips.
Only the unit/coverage summary contexts may become required; skipped matrix jobs
report unexpanded matrix names. Preserve security, admission and concurrency.
Run the complete root suite using the discovery and Node flags in
`turbo-unit-tests.yaml`, including supplemental action/database contracts, when
changing this gate. Classifier tests alone miss existing summary contracts. Test
every applicable summary shell step with explicit classification fixtures;
retain all fresh root/shard/Rust, switchboard and stable-name failure cases.

Self-hosted PR routing is default-off and limited to same-repository, non-bot `pull_request` jobs without secrets, installing with a frozen lockfile and no lifecycle scripts, with isolated state and an always-run workspace wipe. The variable values, canary and kill switch live in the [CI runbook](../../../../apps/docs/build/devops/github-actions-runbook.mdx#pr-runner-pool-variable-canary-and-kill-switch). When inventorying action steps, JavaScript actions have no `runs.steps`.

Mobile PR selection lives in `scripts/ci/mobile-build-selection.ts`, called by the
switchboard after explicit disable handling. Android remains the portable smoke;
other platforms retain native-directory PR checks. Android/Linux keep matching
main pushes; iOS/macOS/Windows development builds use nightly/release/manual.
Only known portable/other-native paths may omit a platform. Unknown/empty inputs,
dependency manifests and tooling changes run all. Preserve PR triggers/check names
and include the helper in the reusable switchboard sparse checkout. Verify
`mobile-build-selection.test.js`, `check-workflow-config.test.js` and
`runner-efficiency.test.js`; release/production/mobile publication is outside this
selection policy. See the CI runbook's mobile PR build selection section.

## Packed SDK install diagnostics

For installed dependency validation, inspect Node's package-relative module search
directories inside the disposable consumer. Match each physical package to its
exact root or SDK-nested lock key and reuse that verified entry for registry tuple
comparison. A root-only lookup can falsely reject a legitimate npm nested layout.
Keep absent packages, identity/version or integrity mismatches, links and symlink
components as hard failures; never fall back past an invalid nested package.
Run `node --test scripts/ci/sdk-installed-dependencies.test.js` for the focused
physical-layout and rejection regressions. A synthetic layout test does not
replace exact-artifact consumer evidence or public qualification.

The qualification receipt preserves stream hashes/counts and a bounded, strictly
parsed public npm E404 identity. Never upload raw npm output or the private cache.
Run `node --test scripts/ci/qualify-sdk-package.test.js`, including its diagnostic
suite, before updating the PR. Missing identities stay unknown; use a new exact-head
receipt rather than infer a dependency fix from a hash. See the
[CI runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx)
for the allowlist, limits and cleanup behavior.

When applying shared concurrency policy to SDK qualification, retain its
forbidden-trigger/secret/publication assertions. Use the event payload's positive
PR number for PR grouping without introducing privileged trigger names into this
raw-head workflow. Run `qualify-sdk-package.test.js` together with
`protected-workflow-concurrency.test.js` to verify both security and cancellation
contracts; focused policy tests alone do not replace the complete root script suite.

## Satellite build evidence

Automatic platform builds do not establish satellite build compatibility.
Mail/Calendar/Tasks changes use `mail-calendar-tasks-builds.yaml` for exact PR-head
and main-SHA builds without deployment or production credentials. Keep the
separate tests/type-check/lint gates; a skipped manual preview is not build
evidence. Build-only workflows use placeholder public configuration and
read-only permissions. Live provider consent/delivery remains a separate check.
Calendar's `calendar-native-inventory.mjs` owns the finite emitted hidden-file
contract: exact `.assetsignore` bytes, typed Vite manifest metadata and hashes for
both files. Do not infer this contract from another app's output or permit
`.dev.vars`. The shared runtime's explicit Calendar profile dispatches the same
inventory across original/copy/finalization; default callers still reject hidden
entries. `calendar-native-artifact.test.mjs` imports the profile controls so CI
executes credential, metadata, copy and final-seal regressions without SDK loading.
Debug archives require bounded name/type/escape/link inspection before private
extraction; retain producer receipt hashes and source identity separately from
runtime acceptance.

Native Meet/Calendar/Apps source-bearing receipts must use the same PR-head-or-event
selection as checkout, stamps, seals and runtime expectations. Preserve the actual
event and workflow supplier SHAs separately. Meet's existing `GITHUB_SHA` consumers
receive the source value only on their individual commands. Its release-only
comparison uses the shared `ci-check.yml` event checkout and explicit PR base/head
inputs; identity tests must follow that caller edge after job consolidation.
Run the three
`scripts/ci/*-native-source-identity.test.js` suites for mismatched head/event/supplier
controls; shell command sinks prove wiring only, never Worker acceptance. See the
[CI runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#validation-and-delivery-evidence)
for the diagnostic collector's legacy comparison field and remaining gates.

## Root Scripts

- Resolve app-owned packages in root Node tests with `createRequire` anchored to
  the real owning app's `package.json`; keep relative helpers on the original
  `require`. See the [CI runbook's resolution control](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#validation-and-delivery-evidence)
  for a resolver-only fixture that excludes root links and `NODE_PATH`, followed
  by focused behavior verification. Web owns the satellite cohort tests'
  Playwright; Lettin owns its config-loader test's Next SWC.
- Root script tests belong in `node --test scripts/*.test.js` and should be
  wired into `scripts/check.js` when a new utility needs CI coverage.
- Translation automation should use `scripts/i18n-common.js` for app message
  discovery, nested key assignment, and stable JSON sorting. Do not add new
  hard-coded `apps/*/messages` lists to i18n scripts; use `bun i18n:add` and
  its bulk `--mode add|remove|replace` paths for translation key operations,
  and reserve manual JSON edits for broad prose rewrites or value-only updates.
- For Mind shared-UI translation coverage, run
  `bun scripts/i18n-rendered-keys.js` through the resource broker. Its import
  graph covers both locales, including literal lazy imports and explicitly
  bound translator props; the i18n workflow runs it before the existing
  namespace checker. Use `apps/mind --json` for key-to-source evidence. Qualify
  dynamic expressions and wrapper bindings before enabling another satellite;
  never substitute package-wide requirements from unrelated screens. See
  [shared UI translations](../../../../../apps/docs/platform/architecture/satellite-apps.mdx#shared-ui-translations)
  and the real-source negative controls in `i18n-rendered-keys.test.js`.
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
- Hosted profile browser dependency setup uses a step-local `APT_CONFIG` for
  the runner's signed Ubuntu sources. Preserve signature checks, native browser
  packages and runner-owned browser downloads; vendor-feed setup errors are not
  application failures. Require exact-commit CI to verify runner layout and packages.
- `ttr storage status|analyze|suggest|prune|fleet` is the machine-wide storage
  triage path (Mac, devboxes, runners). Measure with APFS private bytes or
  allocated blocks with hard links once, never `du -L`. `prune` is a dry run
  until `--apply`, re-verifies hold files (`~/.t3/cleanup/holds.d`), live cwds
  and worktree state per step, and delegates artifacts and Rust targets to the
  repo scripts below. Never auto-remove dirty, unmerged, held, busy or primary
  checkouts, `preserve/*` refs, VM disks or unnamed Supabase volumes. Disk
  admission in `ttr resources` and the bucketed heartbeat `resources.disk`
  (strict on web and Worker) keep work off full disks. See
  `apps/docs/build/development-tools/machine-storage-health.mdx`.
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
- `bun worktree:footprint` reports each registered worktree's allocated and
  APFS-unique size. On macOS Bun `node_modules` are clones of the shared cache,
  so `du` overstates a fresh worktree about 14x (4.3 GiB vs ~0.3 GiB unique).
  `bun worktree:prune-artifacts` is a dry run unless `--apply` is passed. It
  only removes git-ignored, untracked rebuildable outputs (`.turbo`, `.next`,
  `.open-next`, `dist`, ignored `build`, Flutter `.dart_tool` build output) from
  linked worktrees that are clean, unheld, idle,
  and merged into `--base`. Keep `bunfig.toml` `globalStore = false` and the
  default clonefile backend unless exact-commit CI type-check/build evidence
  proves otherwise. Explicit holds-file read errors and fatal check-ignore errors
  fail closed. Holds resolve filesystem aliases; recursive activity scans cap depth
  at 32 and entries at 10,000, treating incomplete scans as active. Each apply
  invocation builds a fresh plan. Checkout scans protect `.git` directories/files
  and bare `HEAD`/`objects` markers, including ancestors inside the worktree.
  Deletion walks repeat those boundaries and never recursively remove directories.
  Before deletion, `lsof +D` checks open files and working directories with a
  five-second forced-kill deadline and 1 MiB output cap. Missing tools, warnings,
  failures and ambiguous output preserve artifacts as `liveness-unknown`; live
  users produce `in-use`. Only an empty, warning-free no-match result admits
  deletion. Locks and holds remain necessary to fence later owner activity.
  Rust targets remain owned by rust-cache.
  See `apps/docs/build/development-tools/worktree-disk-usage.mdx`.
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

For native Wrangler lifecycle qualification, separate source/static review, runtime evidence and customer delivery; candidates do not clear caller adoption.
Calendar's finite adapter profile delegates admission to its existing sealed
artifact validator and preserves emitted config bytes. Its configured application
Worker denies every outbound request; the hash-pinned SDK control plane, generated
registry/core/debug helpers and Node networking are trusted tooling outside that
boundary. Do not describe this as whole-runtime confinement. Preserve default
unknown-field/external-worker rejection, lifecycle proofs and production
cost/stop/access gates. See the Calendar emitted Worker caller section in
`apps/docs/build/development-tools/without-docker.mdx` for source-only controls and
the separate fresh-artifact, exact-head hosted acceptance sequence. The offline
VM companion is not a second Miniflare constructor.
Apply the narrow returned-Worker classification and independent closure gates in `apps/docs/build/development-tools/without-docker.mdx`;
preserve the existing three-minute watchdog, 30-second boundary-test limit and old raw NOTPASS results.

Record hashes and owning package versions for the CLI actually loaded and its
resolved transitive Miniflare entry. A root package, lockfile resolution or local
snapshot does not prove installed CI bytes. Keep the notified PR head, synthetic
merge checkout, dependency resolution and installed supplier receipt distinct;
require evidence for the actual tested commit and never borrow another SHA's green
result. Supplier receipts alone do not prove the complete runtime graph.

A logical module-specifier rejection does not prove rejection of a physical
neighboring file. Preserve the required Durable Object export when isolating Node
compatibility; its absence can fail startup before the intended control. Omitted
Node flags do not necessarily disable Node support: inspect the effective date,
flags and selected supplier's default threshold. Keep such thresholds bound to
that supplier rather than publishing a current-version rule as general policy.
The isolated syntax case follows the [observable closure contract](../../../../../apps/docs/build/development-tools/without-docker.mdx); preserve its test wiring and keep internal cleanup and descendant closure UNKNOWN. Application caller adoption remains a separate gate.
The dedicated preload control has a different scope, with no generic missing-Worker waiver. Next CI must bound public cause-chain
and independent proof-phase observations, normalize path roles, mark unknowns/missing fields/truncation and retain full private evidence.
Preserve primary errors; receipts or observed errors alone never establish closure. Source assertions do not clear runtime NOTPASS.

- Pin every remote `uses:` in workflows and composite actions to a full commit
  SHA with a trailing `# vX.Y.Z` comment so Dependabot can bump it;
  `scripts/ci/workflow-action-pins.test.js` enforces this. Resolve a tag with
  `git ls-remote --tags <repo>` (use the peeled `^{}` SHA). The exception is
  `supabase-staging.yaml`: Supabase Production authenticates its exact Git
  blob, so pin it only together with the producer-contract allowlist.
- Keep workflow Bun versions aligned with the repo `packageManager` pin.
- Workflows that need Bun should use
  `.github/actions/setup-bun-with-retry` instead of `oven-sh/setup-bun`
  directly. The local action downloads the pinned Bun release with bounded
  exponential backoff so GitHub release 5xx failures do not immediately fail
  deploys.
- Install the Supabase CLI through `.github/actions/setup-supabase-cli-with-retry`
  after checkout with Node 20+ and npm. It pins setup-cli v3.0.1 by SHA and
  resolves the exact stable CLI from root `bun.lock`; overrides must be exact.
  No token input is needed. Its runner-temporary home isolates setup-bun;
  verify and restore the existing Bun path after every installation attempt.
  Four installation attempts use 5/10/20-second backoff and fail on exhaustion.
- Contract startup and type generation share `run-supabase-image-retry.js`:
  seven attempts, 10/20/40/80/120/120-second waits plus 0-25% jitter for throttling or transient pull transport errors. Never retry SQL tests, resets or pushes. Keep bounded stderr separate from generated types and publish only
  successful output. The E2E baseline keeps its existing service set (excluding only Edge
  Runtime and Functions); SQL-only verifiers retain their narrower exclusions. Run `TMPDIR=/private/tmp node --test apps/database/scripts/run-supabase-image-retry.test.js`.
- Baseline startup captures child output because it can contain credentials.
  Forward only fixed failure classifications, including the retry helper's
  seven-attempt exhaustion marker; never dump a child-process error or raw
  stdout/stderr into CI. Cover large stderr under a piped parent and preserve
  nonzero exit codes. For Linux Docker volume-diagnostic compatibility and
  isolated reproduction, see the database automation section of
  `apps/docs/build/devops/github-actions-runbook.mdx`.
- Release Please is the monorepo source of truth for version/changelog PRs.
  Keep `release-please-config.json`, `.release-please-manifest.json`,
  `.github/workflows/release-please.yaml`, and `tuturuuu.ts` aligned when
  changing release automation. Do not reintroduce checksum or PR-title package
  version bump generators.
- Use `bun git-release-please` from a clean `main` checkout to merge the latest
  `release-please--branches--production` branch. The helper fetches the bot
  branch, merges without committing, syncs the platform badge version files from
  `platform-version.txt`, runs `bun ff`, stages the resolved merge, then runs
  `bun validate` directly before the merge commit lands. If the staged release
  merge includes `apps/mobile` paths, the helper also runs `bun check:mobile`.
  If a manual merge is already in progress, run
  `bun release:sync-platform-version` before staging the resolved
  `TUTURUUU_PLATFORM_VERSION` files.
- A CI job that runs `bun validate` (or any turbo `test` task) on a fresh checkout
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
  or dependency-output failures; never run local `bun validate` or delete shared
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
  organization admin, stored only in the branch-restricted `release-please`
  environment (`main` + `production`) that both release jobs declare. Ruleset `Protected branches` covers `main` and
  `production` with only `OrganizationAdmin` as a bypass actor, so a run that
  falls back to `github.token` merges fine and then dies on
  `GH013: Changes must be made through a pull request`. Do not "fix" this by
  giving the Actions app a ruleset bypass: `GITHUB_TOKEN` pushes do not trigger
  `push` workflows, so the `production` push would skip the Vercel production
  planner and the next Release Please run. Gate any workflow that will push
  protected branches on the secret being present, before the expensive steps —
  discovering it after `bun validate` wastes ~40 minutes per run.
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
  newer pushes. PR validation groups use workflow, event and PR number, with
  `cancel-in-progress` enabled. Safe push validation coalesces `main` by workflow
  and ref. Production, generated Release Please refs and manual qualification
  retain SHA/run/attempt identity. Explicit reruns (`github.run_attempt > 1`)
  must also disable cancellation and use that isolated identity; changing only
  the cancellation flag leaves candidates vulnerable to later main pushes. Never
  combine `queue: max` with cancellation enabled.
- Defer heavy PR validation on drafts before runner allocation, while keeping
  light lint/type checks. Security jobs, including CodeQL analysis and the
  security-egress contract/preflight, remain eligible on drafts. Heavy-only
  non-security workflows can gate `check-ci`;
  mixed workflows gate only heavy jobs and dependent summaries. Include
  `ready_for_review` and `converted_to_draft`, preserve existing aggregate failure
  assertions, and verify merge-eligible required checks still report. Keep path
  selection in the existing switchboard or trusted security selectors. Run
  `pr-verification-scheduling.test.js` with the concurrency policy suite.
  Apple/Windows mobile development builds run nightly, on published releases and
  on manual dispatch. This coverage exception validates selected snapshots, not
  every merged SHA; nightly selects the default-branch head. Android/Linux retain
  matching main pushes. Store and production publication retain their triggers,
  locks and gates. See the
  [CI runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#draft-pr-runner-admission).
- Only the exact SHA selected for promotion needs complete CI. Superseded `main`
  validation may be cancelled, but cancellation is never passing evidence. If a
  pinned candidate lost a required check to supersession, restore that exact-SHA
  validation before promotion; do not credit a newer main SHA or weaken the gate.
  Use the runbook exact-run procedure (`gh run list --commit <sha>`, inspect,
  then `gh run rerun <run-id>`); reruns retain the original SHA/ref and workflow
  revision. Older workflow revisions do not acquire this protection on rerun.
  Production deployment, migration and release workflows retain their locks.
- Keep mutating jobs outside cancelling workflow parents. Biome uses job-specific
  cancellable validation locks and a separate serialized non-cancelling mutation
  lock. Guard Modal deployment before its job lock; cancelled validation
  completions must never cancel active provider work. Discover `workflow_run`
  consumers in regression tests rather than protecting producers in isolation.
- Never trust expression `==` for protected refs; it ignores case (`Main`).
  Every `workflow_run` consumer starts with the canonical inline "Verify trusted
  trigger" step: it checks the exact producer path, ID, branch and head
  repository, and confirms `head_sha` is reachable from the branch. It binds
  checkouts to the verified SHA and gates secrets on its output. Keep the step
  byte-identical across consumers (`workflow-run-trigger-gate.test.js`), and
  re-allowlist the staging blob in Supabase Production after editing staging.
- Keep the PR exception list in `scripts/ci/protected-workflow-concurrency.test.js`
  explicit. Desktop Beta and the seven mixed Cloudflare workflows retain their deployment locks;
  gVisor acceptance retains bounded cleanup. Paused Docker/Rust workflows are
  unchanged, and paused TanStack validation retains its existing policy. New
  validation workflows must coalesce PR revisions, including `pull_request_target`
  events whose `github.ref` points to the base branch. Calendar and Mail
  Cloudflare cancel only PR revisions (main is a main-only exception); their
  upload lock lives in `wave1-native-publish.yaml`, so never add the parent's
  group to a called workflow.
- Reserve hosted runners for main, production and release work. Verify PRs
  primarily with exact-head local or remote-fleet runs, and batch pushes rather
  than pushing WIP. Path-filter heavy PR triggers only (append `'!**/*.md'` and
  `'!**/*.mdx'` to PR `paths`, or use docs-only `paths-ignore`). Leave main push
  filters unchanged: promotion and CodeQL baselines need complete main runs.
  Check rulesets first, because a trigger-filtered required check never reports.
  Required checks need a job-level `check-ci` skip instead. Moving PR CI to
  self-hosted fleet runners is a follow-up and is not adopted. See the
  [runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#hosted-runner-reservation-and-pr-queue-pressure).
- Lanes push once after exact-head local gates pass. Batch review fixes rather
  than pushing many small commits during review loops. Heavy PR jobs require
  `ready-for-ci`; add it only after independent review APPROVES and the PR is
  merge-ready (`gh pr edit <n> --add-label ready-for-ci`). An exact-head local
  pass still counts as green under the speed grant. A new push to a labelled PR
  reruns CI and supersedes the old run. Retrigger without a push by removing and
  re-adding the label; `gh run rerun` replays the original event, so a
  pre-label run stays skipped. Most heavy workflows admit by label presence.
  In the consolidated `pr-checks.yaml`, only `ready-for-ci` label changes rerun
  selected validators; other label changes run CI admission and its aggregate
  in unique non-cancelling groups, including the admission callee. Their gate
  is named `Cheap PR Checks (label event)` so it cannot replace full validation
  evidence under `Cheap PR Checks` on the same SHA. They provide admission
  evidence only, not a new validation pass. Skipped checks are not
  evidence once the label is removed. The always-on CI Admitted check
  (`pr-checks.yaml` → `ci-admitted.yaml`) reads current labels from a base-commit script. It is red
  without the label, and on the push/label race, which it reports with re-add
  guidance. It is advisory: the base commit protects the script, not the
  PR-supplied workflow file. A missing base script fails red, never green. A
  green admission run can coexist with a newer skipped heavy run; confirm the
  heavy checks are not skipped, or re-add the label. Unadmitted PR runs use
  `UNADMITTED_GROUP_SUFFIX`, so they never
  cancel an admitted run. Append that suffix to every new heavy workflow's
  cancelling group. Do not add per-workflow admission jobs: they would allocate
  a hosted job on every unlabelled push. Gate every job of a new heavy PR workflow
  with `PR_LABEL_GATE` from `scripts/ci/pr-label-gate.js`, ANDed at the top
  level. Add `labeled` to `pull_request.types`; readiness label events share
  the ordinary validation group, while metadata-only label events must use a
  unique non-cancelling group. Classify the workflow there. Gate callers, never
  reusable callees; never use workflow-level filters. Leave paused `if: false` jobs alone. Branch-push validators keep
  push only for `main`, `production` and `release-please--branches--**`; keep
  mutating jobs (Biome auto-format) push-only. Cheap script-only and security
  checks stay ungated. See the
  [runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#label-gated-heavy-pr-ci-ready-for-ci).
- Verify new third-party action pins through the owning repository's
  `git/commits/<sha>` API. Annotated tag objects are also 40 hex digits; use the
  tag's peeled commit. The offline pin suite rejects observed tag objects but
  cannot establish arbitrary object types from syntax alone.
- Consolidate PR-only release checks into the reusable CI config job with
  `check_pr_release_only: true`. Meet, Lettin and Parley compare the same PR base
  and head as before; production/manual events always return `run_checks=true`.
  Meet validation must still need `production-policy` and require explicit
  successful admission on production before any secret-bearing step; read both
  validation outputs from `check-ci`, and retain PR/main validation when policy
  is skipped.
  Removing their separate release jobs saves up to three runner allocations per
  production plan without bypassing app configuration, validation or deploy gates.
  The planner already resolves all target configurations once. Further removal of
  per-app config jobs needs equivalent output/failure coverage. A dedicated
  concurrency group serializes work but cannot reserve GitHub-hosted capacity.
  Runner pool or account capacity changes require separate admission; Upskii
  runners are outside this repository's custody.
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
- Keep [cache credentials and held publisher admission](wave1-production-credentials.md)
  step scoped, outside workflow/job environments and `GITHUB_ENV`. Repository
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
- Keep the Turbo global hash small. Never add workspace packages to root
  `package.json` dependencies: Turbo hashes the root's workspace closure
  globally, and the old email-service root dependency busted every task on 11
  of 40 main commits. Machine paths (`PUB_CACHE`, `LOCALAPPDATA`,
  `USERPROFILE`) are pass-through only. Hash gitignored files that change
  results (`.env*` for Vitest `loadEnv`, `.dev.vars*` for `wrangler types` and
  `cf workers types`), and cache the generated declarations the tsconfig reads
  (`.cloudflare/types/**` for `cf workers types`).
  `scripts/ci/turbo-cache-config.test.js` pins these rules. Diagnose misses
  with `--dry=json` hash comparisons as described in
  `apps/docs/build/devops/caching.mdx`; never narrow `^type-check`/`^transit`
  links or exclude upstream `__tests__` to raise a hit rate.
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
- Bound Gradle Actions caching to wrapper distributions and
  `caches/modules-2/files-2.1` downloads. Only the main-push Android build may
  save, after `gradle-cache-budget.js` admits at most 512 MiB including tar
  overhead allowance; oversize skips the save without pruning build state.
  Use stable `gradle-downloads-v2-` platform/Java keys, with no build-file hash
  generations or broad v1 restore fallback. Flutter SDK/pub keys use only
  platform/channel/release identities; never add pubspec-lock generations to
  download archives. Run `node --test scripts/ci/heavyweight-cache-budget.test.js
  scripts/ci/mobile-cache-budget.test.js scripts/ci/flutter-cache.test.js` when
  changing these policies. Follow the [cache budget runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#repository-cache-budget)
  for operator-only old-key cleanup and Supabase reseeding; static checks do
  not establish hosted retention. Preserve runner routing until a pool and its
  trusted-job admission are verified.
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
- Do not patch unrelated packages just because `bun validate` fails outside the
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

For Cron recovery cost review, count the requeue RPC and pending lookup even when
there is no delivery. Each database phase uses a 30-second signal; web delivery
uses a separate 180-second signal. A one-row lookup parameter does not
bound full response consumption or requeue database work. Count repeated failed
invocations separately and require durable recurring authority/progress and stop
fences before certifying the schedule. See the recovery request envelope in the
Cron Control runbook; mocked HTTP counts are not billed-row or hosted-stop proof.

Cron Control database recovery and lookup each carry a 30-second AbortSignal and
reject redirects with `redirect: 'manual'`. Keep body consumption attached to the
lookup signal and preserve failure short-circuiting before later phases. Timeouts
can leave ambiguous remote outcomes; retain pending recovery state and idempotent
RPC behavior, without adding immediate re-enqueue feedback. These deadlines do
not cap recurring invocation counts, billed rows, response bytes or total spend.
See the database request deadline section in the Cron Control runbook for controlled
unit evidence versus hosted scheduling and independent-stop release gates.

Cron Control's scheduled job catalog (`src/jobs.ts`) is default off through the
`CRON_CONTROL_ENABLED_JOBS` var; disabled ticks must do no storage or network work.
Keep job decisions in the pure `LedgerCore` so unit tests run without Workers, and
keep the `cloudflare:workers` Durable Object adapter out of unit-test imports. Count
claims, writes and processor calls in tests: duplicate slots, Durable Object restart,
stop racing a retry, failure-budget exhaustion and the concurrency bound. The runtime
check dispatches scheduled events to a loopback processor; never dispatch the
immediate-notification trigger there. Add a trigger to both `wrangler.jsonc` and the
runtime script's expected list. See the runbook's per-job cutover order.

Require a complete JSON object within the 64 KiB outcome cap before accepting
2xx success. Reject oversized chunks before retaining them; read errors and
invalid or truncated JSON are unknown, never success. Reconciled claims are
settled: late completions must not recharge failures or overwrite an unknown
outcome, including when reconciliation refused a replacement at the budget limit.
Keep dispatch and restart regressions for both late failure and late success.

For checkout expiry, preserve pending obligations with pre-expiry backpressure,
not truncation. Drain owed invalidations before new expiry, isolate failures and
persist per-item attempt counts and bounded quarantine. Settle only Inventory's
explicit per-workspace success receipts. Include claim, pending-work, fence and
completion RPC waits in the whole-run deadline, with no dependent work after a
timeout. Run cron-control's independent unit config; test Inventory's receipt
adapter with its own config. See the processor migration runbook for bounds and
remaining cross-store crash and hosted-runtime evidence.

## Native Meet realtime toolchain

For the native Meet realtime Vite+ workspace, keep the original production Wrangler
entry and migration history intact while CI qualifies `dist/worker/wrangler.json`.
Run emitted-config identity/binding checks and real SQLite routing probes after the
native CI build, alongside the existing lifecycle/protocol integration gates. The
initial configuration type-check and entry lint scope do not certify all retained
service source. See the programming realtime runbook for fixture commands and
hosted-media/cost/cutover boundaries.

For native Worker workspaces tested with explicit Node scripts, provide a separate
Vitest config with an empty include list. Root Vitest discovers all project configs
before file filtering; loading the Cloudflare Vite plugin can start an unrelated
Worker and fail collection on unbuilt imports or missing secrets. Preserve the
explicit protocol and real Worker gates in the owning CI workflow.

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

For scoped Bun changes, frozen restoration alone does not prove the effective
provider or alias identity. Follow the [scoped lockfile guidance](../../../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx#move-one-workspace-at-a-time)
for complete dependency closures, installed app/CLI/plugin resolution checks and
exact-commit CI build evidence.

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

## Owning Next app build evidence

A green shared-dependency workflow does not prove a changed satellite compiled
unless its app is included in that workflow's build matrix. Route changes require
an actual build of the owning app at the immutable PR head. The nondeployment
`programming-app-builds.yaml` matrix includes Tasks and its source path trigger
alongside Web, Learn, Infrastructure, Mail and Contacts. Keep placeholder build
environment values, bounded Turbo concurrency, exact-source checkout and
read-only permissions; preview or production dispatch is not a substitute for
this PR gate.

### Vitest temporary module collection failures

If a Vitest 5 suite fails collection with `ENOENT` for a temporary transformed
module under `/tmp/.../ssr` or `/tmp/.../client`, retain the failed log and distinguish
collection from failed assertions. Focused auth and Colab suites reproduced this
in the fork pool on 5.0.0 and 5.0.3 and passed with `--pool=threads`, retaining
per-file isolation and every test. Run that comparison through the resource broker
with at most two workers before changing configuration. `--no-cache` disables
result caching; it does not prevent the fork pool from using temporary module
files. A single worker and Node 24 alone did not resolve the observed failure.
Apply a pool change only to a validated scope; packages using native or runtime
fixtures need their own compatibility evidence. Do not rewrite global runner
configuration or claim a universal cause from these focused results.

When temporary-file writes also fail with `Disk quota exceeded` despite free
space reported by `df`, or Miniflare D1 startup reports `SQLITE_IOERR_WRITE`,
use one bounded direct validation attempt, pointing the child payload
`TMPDIR` to a verified private writable directory under the owning program only
after resource-broker admission. Do not set `TMPDIR` before `bun validate`: its
`os.tmpdir()`-based check queue would relocate shared state. Verify the destination
quota and preserve the original failure, unknown files and live queue owners. A thread
pool alone passed focused module-loading suites but did not resolve the observed
D1 fixture write failure; private temporary storage did. Record the tested
boundary without claiming an unproven universal cause or changing global config.

### Coordination alarm qualification

Use the App Coordination page's Worker operation envelope when qualifying the
Coordination toolchain. Audit `object.ts` transactions, lease expiry, fingerprint
retention and alarm rescheduling together. Count SQL statements, rows changed/read
and set/delete alarm calls separately, including reconstruction's schema setup.
Test early/duplicate/due callbacks, busy retries, lost alarm persistence and a
release racing an outstanding reschedule. Local SQLite with mocked alarms can
expose residual wake behavior but cannot certify hosted alarm retry/clock behavior
or authenticated emergency-stop fencing. Preserve meeting fingerprint retention
and owner/lease checks; finite per-row retention is not an ingress/account cap.

## Mintlify connectivity cancellation

The canonical local-docs launcher pins CLI and Node patch versions in
apps/docs/mintlify-version.json. Keep its temporary npm prefix to isolate Bun `catalog:` metadata; see [docs compatibility](../../../../../apps/docs/build/development-tools/documenting.mdx#mintlify-runtime-compatibility). Its isolated Node 24.19.0 avoids the pinned
is-online/Got 12.6.1 [retry-after-rejection defect](https://github.com/sindresorhus/got/issues/2469) on Node 24.20+; retain validation
and nonzero exits rather than swallowing errors or adding validation retries.
Use finite loopback refusal controls against the actual transitive package to
reassess compatibility. Strict Mintlify validation compiles docs and remains
CI-only; a connectivity cancellation stack is not an MDX error or a passing
validation result. Remove the compatibility pin only with upstream dependency
and equivalent error/retry evidence, then require exact-source CI acceptance.

## SDK release qualification phases

See the [SDK package release contract](../../../../../apps/docs/build/devops/github-actions-runbook.mdx)
for SOURCE versus PUBLIC qualification. Generated production release PRs validate
source and pack controls without claiming registry acceptance. Production SDK
preparation must run the strict registry/install/compiled-CLI qualifier after
upstream readiness, then publish only the exact SHA256-bound qualified tarball.
Never accept a SOURCE receipt as public acceptance or rebuild after qualification.
Run `node --test scripts/ci/qualify-sdk-package.test.js scripts/ci/package-release-readiness.test.js packages/sdk/scripts/portable-build.test.cjs`
for focused controls; builds and real consumer acceptance belong to exact-SHA CI.

## Windows desktop beta packaging

Unsigned Windows x64 is allowed only with both direct-signing secrets absent. Partial credentials, missing vault tokens, and signer failures block that platform; macOS signing stays strict. Keep source/run/hash receipts and GitHub provenance, and retain signature checks in the Windows updater.
Manual `desktop-beta.yaml` dispatch defaults to a read-only Windows dry run with placeholder inputs, no signing credentials or protected environment, and no publication. Run POSIX command-shim tests on Linux.
See the [desktop runbook](../../../../../apps/docs/build/devops/desktop-beta-distribution.mdx) for costs, secret names, SmartScreen guidance, manual unsigned updates, and native acceptance.

## Apps finite public SDK acceptance

Apps owns `apps-native-runtime-plan.mjs`, `apps-native-runtime.mjs` and
`apps-native-runtime-launcher.mjs`; shared Calendar evidence/lifecycle primitives
remain read-only dependencies. Both existing HTTP and browser callers must use
public `unstable_startWorker` with unchanged sealed Apps output and exact empty
application topology. Keep the original assertions and 3/5-minute CI watchdogs.
Pass the canonical artifact receipt to original and restored HTTP/browser steps;
never inject compiled identity through runtime bindings.

Admission requires Apps-owned Wrangler 4.151.2 and its owning Miniflare
5.20261019.0-beta, with the exact entry hashes documented in the
[Apps runbook](../../../../../apps/docs/build/development-tools/without-docker.mdx#apps-finite-emitted-worker-callers).
Resolve through Apps ancestry before loading, reject preloads, and verify again
after loading and teardown. Required pins are not local qualification evidence.
Keep package-manager repair separate when a stale owning lock edge remains;
reject unrelated lock churn rather than editing the lock by hand.

Queue the focused `apps-native-runtime.test.mjs`,
`apps-native-runtime-receipt.test.mjs` and
`apps/apps/cloudflare/native-runtime-fence.test.mjs` pure tests. They exercise
artifact/source admission, policy bounds, supplier doubles, acquisition-before-ready,
reverse exactly-once disposal, natural child/pipe observation and independent
snapshot/persistence gates without loading the SDK. Runtime qualification still
requires both real callers on original and freshly restored exact-commit output.

Queue `apps/apps/cloudflare/native-artifact-functions.test.mjs` for sealed RPC
metadata discovery. The actual emitted fixture must retain its producer hash;
accept only string literals or single-quasi, expression-free template literals
with a string cooked value. Keep target predicates, exactly-one-distinct-ID,
parse and symlink guards. Reject interpolation, tagged/dynamic/non-string values,
zero/distinct-ID ambiguity and source-map fallback; leave aliases and shorthand
unevaluated. Pure discovery coverage does not qualify actual RPC or browser wire
behavior; the Apps runbook owns the remaining original/restored acceptance gates.

Apps emitted `server/.vite` is a closed metadata directory, containing only a
regular, bounded, typed `manifest.json`. Keep it hashed and copied; require sealed
regular file references and own manifest import keys, preserving own `__proto__`
entries safely. Existing assets-ignore/pointer admission stays unchanged. Never
turn this into a generic hidden-directory exception or SDK-workdir exclusion.
Queue `apps-native-runtime-hidden.test.mjs` for malformed, unknown, credential,
symlink, escape, incomplete and original/copy mutation controls; the existing
Apps runbook above owns the exact profile.

Configured app/negative HTTP hooks admit only the bounded exact local fixture;
SDK-generated helper/control actors are hash-pinned trusted tooling outside that
confinement claim. Record account assurance separately from central forwarding:
exact known-subject admin GET, captured generated service key in apikey/Bearer,
no query, fragment,
URL credentials, Cookie or body. HTTP app assurance is exactly four reads and
negative exactly one, sharing the unchanged 32-operation ceiling; browser stays
deny-all with zero assurance. Preserve the original compiled API 599 negative,
its exact one-call denied counter and zero negative central forwarding. Require
compiled-handler controls for required MFA (403), banned accounts (401) and
unavailable policy (503), using the same session across policy changes, with no
forwarding or cookie clearing, before the original PATCH/cookie assertions. Pure doubles do not prove those runtime
controls. The Apps runbook above owns the exact fixture ledger and limits.
CI must tar the full owned evidence directory, including hidden
`.wrangler` data, before artifact upload. Never replace natural child closure,
independent seals, verified snapshots or persistence readbacks with a fulfilled
`dispose()`. Internal cleanup and descendant closure remain UNKNOWN.


The Apps browser redirect fence owns one public page-target CDP session with
Fetch.requestPaused attached before wildcard Request-stage enablement. Remove
both page.route layers: owning Playwright 1.63.0 auto-continues redirected requests
before user routing; context.route uses the same mechanism. Classify every hop
against the fixed listener and existing fixture origins, continuing without
request overrides, fulfilling constant HTML, or blocking. Preserve service-worker
blocking, exact anchor/307/Location/final-URL/load assertions, deadlines, Worker
policy budgets and strict residual rejection. No browser-wide/OOPIF/popup claim.
Keep Fetch enabled until owned page closure, drain handler promises, observe
session closure or detach, remove handlers, and aggregate failures with the primary.

Queue `apps/apps/cloudflare/native-browser-fence.test.mjs` for pure protocol,
setup, cap, drain and failure propagation controls. The separate finite
`scripts/ci/apps-native-browser-fence.runtime.mjs` uses only two disposable
127.0.0.1 listeners without SDK or external hosts. Require the real old-route RED
bypass (zero fulfillment, one destination upstream), CDP GREEN (one fulfillment,
zero upstream, exact URL/load), an independently classified intermediate hop,
and unadmitted destination blocking (one block, zero upstream). CI runs it with
owning bundled Chromium after existing browser setup. Explicit local `--chrome`
selects existing Chrome via the public channel with headless ephemeral custody;
it is separate evidence from CI Chromium and emitted Worker acceptance. See the
Apps runbook above for cleanup and remaining qualification boundaries. Historical
timeout causality remains UNKNOWN; the routing gap is a separate source finding.

Active local-Supabase jobs use `.github/actions/cache-supabase-images` after the owning dependency install; employee-schema targets `source/apps/database`. Derive service versions from the pinned CLI's `services -o json`, with version-gated supplemental CLI 2.121.0 Dockerfile pins for Kong/Mailpit/imgproxy (2.8.1/v1.31.3/v3.26.0). Catalog local tags override those fallbacks; reject duplicate catalog names while emitting each required image once. Mirror registry rewriting exactly. Cache only each profile's required images, including GoTrue/Realtime/Storage bootstrap migrations even when long-running services are excluded, and postgres-meta for typegen. Exact SHA256 keys bind the list, registry, OS and arch; inspect loaded images and never unconditionally re-pull the baseline Postgres image. Archives are bounded to 6 GiB.

Paused Docker E2E consumers reuse the shared `full` profile rather than a separate `supabase-docker-v2` archive. Keep the registry benchmark switch and all runtime pause gates intact; this consolidates future cache writes without deleting hosted entries or resuming Docker.

Only main pushes/main dispatches save; PRs restore only. Normal misses have three attempts and a two-minute total pull deadline, keeping the 15-minute cross-runner restore budget useful. Throttling and classified transport errors retry; SQL never replays. Summaries expose only known registry hosts and untagged image names. Trusted 600-second Linux x64 seeds can use the fixed `cli-2.121.0` catalog without future CLI/PR execution; preserve exact ECR tag keys and verify pinned platform/config digests before save. All ten seed-profile services across CLI 2.117.0/2.121.0 have source-allowlisted official GHCR platform/config-identical digests (19 unique tags); they may replace an existing retry slot only after classified ECR throttling; failed alternate transport or verification is terminal. Reject canonical/alternate platform or config disagreement before the alternate pull. No credentials or unreviewed images. Regenerate with `node scripts/ci/supabase-image-cache-registry.js`: anonymous ECR/GHCR manifest metadata only, byte-hashed platform manifests, fixed upstream CLI Dockerfiles, bounded requests and no image layers. Review output before updating seed data; missing/mismatched publications stay ECR-only. Edge-runtime/Logflare/Vector/pooling remain excluded, without cache-key expansion. PR misses remain ECR-only pending separate provenance/no-save review. Hosted registry access and shared-cache retention still need acceptance. Main-only `supabase-baseline.yaml` dispatch with `seed_images_only=true` seeds contract/HTTP/full keys with serial execution and fail-fast disabled, with seven attempts within ten minutes each; it requires working registry access. On a profile miss, restore the exact contract key only if its image set is a strict subset, load/inspect it and pull only missing local images. Apply this to PR misses too; save the complete requested set under its unchanged exact key. Matrix ordering is not guaranteed; rerun a partial seed to reuse completed keys. See the [CI runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx) for bootstrap, scope, eviction and Linux reproduction. Run `TMPDIR=/private/tmp node --test scripts/ci/supabase-image-cache.test.js scripts/ci/supabase-image-cache-seed.test.js scripts/ci/supabase-image-cache-registry.test.js scripts/ci/supabase-registry.test.js scripts/ci/supabase-baseline-key.test.js apps/database/scripts/run-supabase-image-retry.test.js apps/database/scripts/run-supabase.test.js`; local checks do not establish exact-head hosted cache acceptance.

## Wave-1 staging publication admission

Keep the four-app production hold independent of staging. Same-account staging
requires the reviewed `stagingAdmission` profile, only the named staging deploy
secret, isolated resource identities and the exact app/source/artifact repository
admission variable. Read the stop and admission records again immediately before
upload. Consume admission in the owner-provisioned staging D1 ledger before invoking
Wrangler. Authenticate its scoped HMAC and run identity with the staging deploy
credential, use a conditional SQL update and readback, and fail closed on missing
or deleted rows. PR job tokens must have no write authority over this ledger.
Explicitly forward only staging deploy/control credentials and public inputs through
every reusable-workflow boundary; never inherit production secrets. Staging has no
workers.dev, preview URL or public route; success observes provider identity and
private-serving state rather than issuing a public HTTP probe. Preserve CI workerd
acceptance and obtain a separately approved private ingress plan for hosted UX.
Never delete consumption history to renew admission or infer retry permission from a
missing local receipt or inactive version. Reconcile listed versions by detail SHA/tag and retain unresolved attempts.
The [publisher runbook](../../../../../apps/docs/build/devops/wave1-native-publishers.mdx)
owns the schema, bounded operation counts, residual account risk and recovery.
For private production preparation, keep the read token confined to preflight and
post-upload verification, and the deploy token confined to the upload step. Check
replay history per app across source SHAs and attempts; an accepted receipt must
match the current rollback baseline before it closes older history. A skipped
upload after read-only refusal is retryable; an unknown write is not. Follow the
runbook's original-run reconciliation procedure rather than clearing history.
Run `wave1-native-publication.test.js` for the real entrypoint transport tests and
its final-fence removal negative control, alongside publisher/policy/credential
and workflow suites. Source-only tests do not establish hosted token permissions
or emitted Worker acceptance.

## Reusable staging publisher permissions

Keep PR artifact qualification read-only and call staging publishers from separate
main push/dispatch jobs with explicit deployment-write permission. A skipped nested
publisher is still a reusable permission contract; remove that call from the
read-only qualification workflow. Assert exact staging secret maps and expressions
at each caller boundary and reject references elsewhere, including the actual
production token name `CLOUDFLARE_API_TOKEN`. The wave-1 permission and publisher
secret tests cover these boundaries; protected concurrency tests preserve the
non-cancelling durable-attempt publication queue.

Include `.cloudflare/output/**` in Turbo build outputs. Validate a real cache-hit
replay after deleting emitted files; replayed logs alone do not qualify an artifact.
Keep `.cloudflare/state` outside cache outputs. cf prerelease pins remain held by
Renovate until an owner qualifies a scoped upgrade. Production jobs require the
Actions repository variable `CLOUDFLARE_ACCOUNT_ID` to match emitted account identity.

For retained DO publication, allow only Vite's exact `.vite/manifest.json`
metadata path outside the qualified module inventory. Test the adapter on real
emitted output with `cf-wrangler-publication.runtime.mjs`; synthetic bundles miss
Vite metadata. Keep migration tags and symlink/extra-file refusal checks.

## Aggregate name and native Bun qualification

Use `bun validate` / `bun validate:now` for the existing aggregate runner.
Do not add a `check` package script: it shadows Bun's native checker. The
collision regression in `scripts/validate-command.test.js` covers every root
and workspace manifest through the existing script-test gate. Keep guard,
format/lint/test, conditional checks, fail-fast/mandatory-Biome handling and
queue/child-temp semantics intact when changing the entrypoint. Retain legacy
queue directory/environment identifiers for in-flight runner compatibility;
process recognition must never identify native `bun check` as an aggregate to
signal with `--force-now`.

For native checking use `ttr resources run -- bun check --no-script -p <project>`, with `--all` when
comparing full diagnostic sets. Use the admitted Linux exact-SHA runner and the
opt-in `scripts/ci/bun-check-qualification.js`; do not add a duplicate gate.
The wrapper supplies the lane `buildJobs` thread budget if `--threads` is absent
and clamps explicit values to that budget, preserving smaller requests.
The aggregate rejects unknown flags before work starts, including `--help` and
`--dry-run`, with one usage line on stderr and exit 1; resource classification of these flags must not start the aggregate.
Keep agent permissions scoped: broad Bun or aggregate auto-allows defeat this
admission boundary.
The current required compiler is TypeScript 7.0.2; tsrs is an optional shadow.
A matching no-emit sample is not build/reference/emit equivalence. Preserve
`run-tsc-build.js`, Meet's producer/cache contract, Wrangler generated ambient
inputs and Turbo `^build`/`^type-check` until their semantics are separately
proven. Keep TypeScript for emit and editor tooling. Record versions, lock and
input-closure hashes, exact commands, negative control detection, diagnostic
multisets, exit status, RSS and cold/warm/error timings. Never promote on timing
alone. See the maintained [qualification procedure](../../../../../apps/docs/build/development-tools/overview.mdx#native-checker-qualification).

Bun 1.4.4 and the repository both report TypeScript 7.0.2, but equality on
prepared no-emit inputs does not establish equality on generated-output
assertions. In the Meet Worker config, tsc reports TS6305 for missing app
reference declarations with `disableSourceOfProjectReferenceRedirect: true`;
Bun reads the source and can pass. Keep the declaration producer and its
output/cache validation. Run the complete baseline graph before interpreting a
prepared-closure parity pass. Calendar's boundary producer and generated
Wrangler ambient declarations also belong to that closure. The opt-in harness
accepts `--all-projects --runs 1` for complete active-project diagnostic coverage,
expanding Meet's solution root into concrete app/Worker configs. Keep repeated
sample benchmarks separate from that one-pass coverage report. A harness exit
of zero proves negative-control detection, not overall gate equivalence; read
`sampleParity`, input-closure stability, diagnostics and the explicit verdict.

The native-check inventory reads existing declaration generators, including
`wrangler types` and `cf types` under any script name; it never invokes them.
Its compatibility detector and data-only fixture use the `producer-inventory`
gap admission in the Wrangler allowlist. Retain the visible legacy token and
remove that admission when no legacy producer needs recognition.

## Canonical bun.lock

`bun install --frozen-lockfile` accepts orphan entries that a plain `bun install`
prunes. When main carries them, every fresh worktree's setup rewrites `bun.lock`,
leaving orphan worktrees that differ only in the lockfile. Type Check therefore
requires a tracked `bun.lock`, runs `bun install --lockfile-only` after the frozen
install, and fails if `git status` reports any `bun.lock` change (an untracked
regenerated file would slip past `git diff`). Fix a failure by running `bun install` locally and committing the result.
Worktree setup scripts should install with `--frozen-lockfile` or `--no-save` so
they never write the lockfile.

## Web browser and fixture test discovery

Playwright's authenticated project collects only `*.spec.ts`; its setup project
owns `auth.setup.ts`. Keep Vitest fixture tests out of browser collection.
Check discovery without starting services with
`bun run --cwd apps/web test:e2e -- --list` and require a nonzero test count.
The root Vitest project `web-e2e-fixtures` runs the employee fixture unit tests:
`bun x vitest run --project web-e2e-fixtures --maxWorkers=1`.
The chat bridge fixture remains an explicit SQL qualification target requiring
its envelope; it is not an ordinary unit test.


The only Docker CI exception is the trusted-main, self-hosted
`e2e-smoke-report-only.yaml` Web browser workflow (authorized 2026-10-28).
Its scoped launcher enforces admission, per-run identities and owned cleanup;
the general paused commands and existing disabled jobs remain paused, including
Rust, TanStack and the cron runner. See the GitHub Actions runbook's
[Report-only Web E2E](/build/devops/github-actions-runbook#report-only-web-e2e)
section for runtime bounds, host-lock recovery and report-only acceptance.

### SQL grant guard review exceptions

Run focused guard suites with `node --test scripts/ci/sql-grant-guard*.test.js`;
`bun test` can enter the root Turbo wrapper. Keep git history fixtures synthetic,
including tracked SQL directories needed by baseline bootstrap. Retain the single
historical-debt baseline and its file pins, occurrence keys, stale-entry rejection,
and pre-push comparison. Generate from current main only for reviewed bootstrap;
ordinary fixes remove entries. Follow the migrations guide for signature-scoped
client-grant markers and statement-scoped dynamic/ALTER review markers. Test both
real line comments and forged markers in strings, dollar bodies and block comments.
Reject an empty-string definer path: `pg_temp` is still searched implicitly, so
only `pg_catalog` first with `pg_temp` last passes.
Reviewed findings belong in `sql-grant-guard-verified-findings.js`, bound to path,
line, rule, file SHA-256, finding digest and reason. Fixed-forward findings must
name an existing hardening migration; test both its presence and its removal.
A placeholder filename leaves the original diagnostic enforced.

## SQL grant guard end-state evidence

`sql-grant-end-state-guard.js` (the ACL-replay companion to the baseline guard; no shared entries) accepts an exact-signature EXECUTE/ALL revoke after the
creation statement in the same or a later timestamped forward migration;
migrations newer than the newest frozen file (`20261029030400`) need the
revoke in the same file, while later migrations are still replayed so a later
PUBLIC/anon grant fails them. Later EXECUTE grants invalidate that evidence, and
manual rollbacks never count. Six frozen definers (single source:
`sql-grant-frozen-definers.js`, exporting `FROZEN_DEFINERS` and
`FROZEN_DEFINERS_CUTOFF`; import it, never copy it) may
inherit an earlier revoke through `CREATE OR REPLACE` while no drop, rename
(signature-free forms cover every overload), plain recreate or public/anon grant follows it; the guard prints each inherited
pass with its evidence. Do not extend the allowlist. Run
`node --test scripts/ci/sql-grant-*.test.js` and both guards (`sql-grant-guard.js`, `sql-grant-end-state-guard.js`), and report
repository-wide failures instead of exempting them. See the
[migrations guide](../../../../../apps/docs/reference/database/migrations-guide.mdx#sql-grant-end-state-guard).

The definer guard also imports this frozen policy and checks surviving inherited
revokes through the same ACL replay. Its dynamic-SQL check requires manual review
for unresolved EXECUTE expressions, including split strings and format calls
without visible privilege text. Reviewed block exceptions bind the migration
path and raw block SHA-256 with a reason. Track role membership and EXECUTE grants
in migration order, including transitive anon access and membership revokes.
Report newly uncovered historical findings; never refresh a baseline to clear them.

## Private Meet transcription evaluation

The evaluation-only CLI and manifest/scoring contract live in
[the AI package eval README](../../../../../packages/ai/src/meetings/eval/README.md).
Keep consented audio, reference transcripts and reports outside every Git checkout.
Run synthetic metrics, dataset-boundary and runner tests with the AI workspace's
Vitest config before the build-free changed-files gate. Provider calls are a
separate consented-data experiment; synthetic green does not confirm D1 or enable
a production provider. Never attach content-bearing provider errors to evidence.
