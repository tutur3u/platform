# Plan 010: Enroll Satellite Unit Tests in the Canonical Gate

> **Executor instructions:** Repair each suite from the repository root, then
> add its `test` script. Never hide a failure with broad exclusions, snapshots,
> or `passWithNoTests`. Land in app-sized commits if ownership permits.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/apps apps/calendar apps/drive apps/inventory apps/mail apps/tasks apps/tools apps/track turbo.json package.json`
> Re-enumerate test files and Turbo dry-run output after any drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MED
- **Category:** Tests / Developer Experience
- **Depends on:** Plan 004 (DONE at reviewed commit `558397b971`); active Tasks
  and Inventory coordination lanes remain the blockers
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The root `bun check` delegates unit tests to Turbo, and Turbo can only run a
workspace that declares a `test` script. Eight deployed Next workspaces contain
committed unit tests but declare no canonical unit-test task. At least 213 test
files are therefore invisible to the required repository gate. Direct execution
also exposed real stale tests and configuration errors, so adding scripts
without a repair phase would merely make `bun check` permanently red.

## Current state

`package.json` defines `"test": "bun turbo:local run test"`, while
`turbo.json` defines the shared `test` task. A repository-root enumeration that
excluded `node_modules`, build output, coverage, and `e2e` found:

| Workspace | Unit files | Current `test` script | Direct evidence |
| --- | ---: | --- | --- |
| `apps/apps` | 1 | missing | not run in this audit |
| `apps/calendar` | 25 | missing | 25 files / 100 tests pass |
| `apps/drive` | 3 | missing | not run in this audit |
| `apps/inventory` | 99 | missing (`test:e2e` only) | 97 files pass; 3 files fail, 25 tests fail |
| `apps/mail` | 24 | missing | not run in this audit |
| `apps/tasks` | 54 | missing | 49 files pass; 5 files fail, 11 tests fail, 1 suite fails |
| `apps/tools` | 3 | missing | not run in this audit |
| `apps/track` | 4 | missing | not run in this audit |

Turbo dry runs report `<NONEXISTENT>` for these workspace test tasks. The
Inventory run from `apps/inventory` also collected its Playwright spec because
`vitest.config.mts` lacks the `**/e2e/**` exclusion, and its source-contract
tests incorrectly append `apps/inventory` to an app-local current directory.
Tasks additionally lacks a `server-only` alias and contains stale auth,
navigation, and workspace-normalization mocks.

Do not include `apps/database` in this plan. Its `.test.js` files are operational
Supabase script tests with a separate lifecycle and are not a Vitest workspace.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Inspect all active coordination notes. At the
planned snapshot, broad Tasks work is `working` and Inventory migration/release
notes are non-terminal, so execution must wait for terminal status or explicit
ownership transfer.

## Exact scope

Allowed changes are the eight package manifests and their existing Vitest
configs/setup files, plus only the failing test files or narrowly required test
stubs discovered by the baseline runs. Add new production-code changes only
when a repaired test proves a current product defect; stop and split that defect
into its own plan first. Do not alter E2E ownership or make Playwright specs run
under Vitest.

## Git workflow

- Branch: `test/enroll-satellite-unit-suites` in an isolated worktree.
- Conventional Commit: `test(satellites): enroll unit suites in root gate`.
- Prefer one app-sized commit per independently green workspace.
- Do not push/open a PR unless asked. Claim the Git commit window before every
  staging/commit operation and never stage coordination notes.

## Steps

### Step 1: Establish root-based baselines

From the repository root, run each suite using the same root semantics its
configuration and source-contract tests require:

```bash
bunx vitest run --root apps/apps
bunx vitest run --root apps/calendar
bunx vitest run --root apps/drive
bunx vitest run --root apps/inventory
bunx vitest run --root apps/mail
bunx vitest run --root apps/tasks
bunx vitest run --root apps/tools
bunx vitest run --root apps/track
```

Record file/test counts and every failure before editing. The audit's app-local
runs already establish the Calendar, Inventory, and Tasks results above; these
root-invoked commands also reveal caller-CWD assumptions. If `--root` breaks
tests that deliberately use repository-root paths, normalize those tests around
`import.meta.url` or an explicit repository-root helper; do not rely on an
undocumented caller working directory.

### Step 2: Repair collection boundaries and deterministic paths

Add `**/e2e/**`, `**/.next/**`, and `**/node_modules/**` to every applicable
Vitest config. Inventory must stop collecting
`e2e/storefront-cache-invalidation.spec.ts`. Replace source-contract test path
construction based on `process.cwd()` with paths resolved from the test module
or a shared stable helper. Add the standard `server-only` stub alias where a
suite imports server-only modules (Tasks is currently missing it).

**Verify:** every workspace collects only its intended unit files from both the
repository root and its app directory; the selected file set is identical.

### Step 3: Repair stale tests without weakening contracts

For each failure, compare the assertion with live route/auth/navigation behavior
and the nearest design/coordination note. Update mocks when required dependencies
or framework calls changed. Update assertions only when the current behavior is
intentional and documented. If a failure reveals a production regression, stop
that app's enrollment and create a focused implementation plan instead of
encoding the regression into the test.

Known Tasks clusters to reconcile are journal app-session auth, task-draft
workspace normalization, navigation destinations and `notFound`, hybrid-search
logging, and the `server-only` import. Known Inventory clusters are stable path
resolution, E2E exclusion, and mocking `connection()` in route rendering tests.

**Verify:** all eight direct commands from Step 1 exit 0 with zero failed or
empty suites.

### Step 4: Declare canonical unit-test tasks

Add `"test": "vitest run"` and `"test:watch": "vitest"` to each of the eight
package manifests, matching established satellite conventions. Preserve
Inventory's separate `test:e2e` script.

**Verify:**

```bash
bun turbo:local run test --dry=json \
  --filter=@tuturuuu/apps --filter=@tuturuuu/calendar \
  --filter=@tuturuuu/drive --filter=@tuturuuu/inventory \
  --filter=@tuturuuu/mail --filter=@tuturuuu/tasks \
  --filter=@tuturuuu/tools --filter=@tuturuuu/track
```

Expected: every selected workspace has command `vitest run`; none reports
`<NONEXISTENT>`.

### Step 5: Prove canonical integration

Run the filtered Turbo task first, then app typechecks, then the repository gate:

```bash
bun turbo:local run test \
  --filter=@tuturuuu/apps --filter=@tuturuuu/calendar \
  --filter=@tuturuuu/drive --filter=@tuturuuu/inventory \
  --filter=@tuturuuu/mail --filter=@tuturuuu/tasks \
  --filter=@tuturuuu/tools --filter=@tuturuuu/track
bun type-check:calendar
bun type-check:drive
bun type-check:inventory
bun type-check:mail
bun type-check:tasks
bun type-check:track
bun check
git diff --check
```

Use the equivalent filtered Turbo typecheck for Apps and Tools if no root alias
exists. Expected: all commands exit 0 and `git diff --check` prints nothing.

## Done criteria

- [ ] All eight workspaces declare canonical `test` and `test:watch` tasks.
- [ ] Vitest never collects Playwright E2E specs.
- [ ] Tests pass from stable root semantics and do not depend on caller CWD.
- [ ] No stale assertion was changed without confirming intended behavior.
- [ ] Filtered Turbo tests, app typechecks, `bun check`, and whitespace checks pass.
- [ ] `plans/README.md` records completion and any split production defects.

## STOP conditions

Stop on any live-service/secret requirement, production behavior regression,
non-terminal path owner, or suite that requires a materially different runner.
Do not use exclusions, retries, serial mode, or increased timeouts solely to
make the gate green.

## Maintenance notes

Plan 004 is DONE at reviewed commit `558397b971`; incorporate that base before
execution so future root-level validator tests are discovered.
After this plan, any workspace with committed unit tests but no `test` task is a
review failure; add a static manifest-coverage validator if the pattern recurs.
