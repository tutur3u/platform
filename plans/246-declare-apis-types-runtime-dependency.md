# Plan 246: Declare the APIs Types Runtime Dependency

> **Executor instructions:** Make the published `@tuturuuu/apis` artifact
> declare every package needed when its exported wallet-interest route is
> imported by a clean consumer. Use Bun for dependency changes; do not manually
> edit dependency fields or accept workspace-linked imports as artifact proof.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/apis/package.json 'packages/apis/src/finance/wallets/walletId/interest/route.ts' scripts/ci/npm-package-artifact-smoke.json scripts/ci/npm-package-artifact-smoke.test.js scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js .github/workflows/release-apis-package.yaml bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 236 has not established the installed-
  tarball smoke matrix, Plan 228 overlaps the APIs manifest/release contract,
  and the Mail handoff owns `bun.lock`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** dependencies / package release integrity
- **Depends on:** Plans 228 and 236; Mail lockfile transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

`@tuturuuu/apis` wildcard-exports source modules, including a wallet-interest
handler that dynamically imports `@tuturuuu/types` at runtime. The package lists
Types only as a development dependency, which npm does not install for a
consumer. Monorepo links hide the defect, so source tests and typechecks can be
green while a published route fails with a missing-module error.

## Current state and exact contract

- `packages/apis/package.json:26-31` declares `@tuturuuu/types` under
  `devDependencies`; `packages/apis/package.json:41-43` exposes wildcard source
  exports.
- `packages/apis/src/finance/wallets/walletId/interest/route.ts:154-157` executes
  `await import('@tuturuuu/types')` to obtain `getDefaultRate`. This is runtime
  code, not an erased type-only import.
- `.github/workflows/release-apis-package.yaml:153-162` prepares and packs the
  APIs artifact. The prepared manifest rewrites `workspace:*` versions but does
  not promote development dependencies for consumers.
- Plan 228 removes the separate private `@tuturuuu/payment` peer. Plan 236
  establishes a clean installed-tarball smoke matrix but currently names
  `@tuturuuu/apis/finance/request-access` as its APIs example; that subpath does
  not execute this dependency edge.
- The required final manifest contains `@tuturuuu/types: "workspace:*"` in
  `dependencies` and not in `devDependencies`. Make this change with Bun from
  `packages/apis`; review and retain only the expected `packages/apis/package.json`
  and `bun.lock` changes.
- Extend the Plan 236 APIs smoke entry to import
  `@tuturuuu/apis/finance/wallets/walletId/interest/route`. Keep its existing
  APIs smoke specifier too; the new route is a regression contract, not a
  replacement for general package coverage.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact transfer
from the Mail handoff for `bun.lock`, and coordinate with Plans 228/236 before
touching their shared APIs manifest, smoke matrix, tests, or release workflow.
The current Mail note is
`tmp/agent-coordination/20260711-134432-codex-mail-catchall-ux.md`, status
`handoff`, and explicitly owns `bun.lock`; no current note owns the exact APIs
wallet-interest route.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Manifest placement | `node -e "const p=require('./packages/apis/package.json'); if(p.dependencies?.['@tuturuuu/types']!=='workspace:*'||p.devDependencies?.['@tuturuuu/types']) process.exit(1)"` | exits 0 |
| Focused package | `bun run --cwd packages/apis type-check && bun --cwd packages/apis vitest run 'src/finance/wallets/walletId/interest/route.test.ts'` | typecheck and existing focused tests pass; if the route test does not exist at execution time, STOP rather than inventing an unrelated test path |
| Smoke contracts | `node --test scripts/ci/npm-package-artifact-smoke.test.js scripts/ci/package-release-readiness.test.js` | installed-artifact dependency/import cases pass |
| APIs artifact | `node scripts/ci/npm-package-artifact-smoke.js --prepare-and-smoke packages/apis` | a clean temporary consumer installs the exact prepared tarball and imports both configured APIs subpaths without workspace fallback |
| Repository | `bun check && git diff --check` | all checks pass and whitespace is clean |
| Scope | `git status --short` | only the approved plan implementation paths are changed |

## Scope

**In scope:** `packages/apis/package.json`; `bun.lock`; the Plan 236 checked
artifact-smoke matrix and its focused test only as needed to add the exact APIs
route import; package-readiness tests only if their landed contract requires an
explicit runtime-dependency assertion.

**Out of scope:** changing wallet-interest behavior or response shapes; moving
`getDefaultRate`; changing any other APIs dependency; payment/payment-core
refactoring from Plan 228; broad release workflow changes; versions, Release
Please files, registry permissions, or publishing an artifact.

## Git workflow

- Use an isolated `.worktrees/` checkout and run `bun setup` immediately.
- Branch: `fix/apis-types-runtime-dependency`.
- Claim `bun git-commit-window` before staging or committing and release it
  afterward. Commit with `fix(apis): declare types runtime dependency`.
- Do not push, open a PR, publish, or run `bun git-sync` unless instructed.

## Steps

1. Re-run the drift and ownership checks. Confirm Plans 228 and 236 are
   integrated or their owners have transferred the exact overlapping paths.
   Confirm the dynamic import and manifest placement still match Current state.
   **Verify:** the drift command is understood and `git status --short` contains
   no unowned changes in the in-scope paths.
2. In the landed Plan 236 smoke fixture, add the wallet-interest route to the
   APIs package specifiers and add/adjust a focused assertion that every listed
   specifier is imported from the installed tarball. Run the smoke test before
   the manifest fix and prove the clean consumer reports the missing Types
   runtime dependency. Do not weaken dependency installation or workspace-
   resolution guards to make the fixture pass.
   **Verify:** the focused smoke test fails for the missing dependency and no
   other reason.
3. From `packages/apis`, use Bun to move `@tuturuuu/types@workspace:*` from
   `devDependencies` to `dependencies`. If `bun add` does not change the
   dependency category cleanly, use Bun's remove/add commands; never hand-edit
   the manifest. Inspect the lockfile diff and reject unrelated workspace
   version or install-mode churn.
   **Verify:** the Manifest placement command exits 0 and
   `git diff -- packages/apis/package.json bun.lock` shows only the category and
   corresponding lockfile edge change.
4. Run focused package tests, smoke tests, and the real disposable APIs tarball
   smoke. Confirm the resolved Types package comes from the temporary consumer,
   not the repository workspace.
   **Verify:** all Focused package, Smoke contracts, and APIs artifact commands
   exit 0.
5. Run `bun check`, whitespace, exact-scope, and dependency-manifest review.
   Record the artifact import and lockfile evidence in the coordination note,
   then commit only the approved implementation paths.
   **Verify:** Repository and Scope commands meet their expected results.

## Test plan

- Preserve the Plan 236 missing-runtime-dependency fixture.
- Add the exact wallet-interest public subpath to the APIs installed-artifact
  matrix so removing or demoting Types fails before publication.
- Keep the existing general APIs import specifier to detect unrelated export
  regressions.
- Use the existing `scripts/ci/npm-package-artifact-smoke.test.js` temporary-
  consumer pattern; do not add a second package installer.

## Done criteria

- [ ] `@tuturuuu/types` is a runtime dependency of `@tuturuuu/apis` and is not
      duplicated under development dependencies.
- [ ] A clean exact-tarball consumer imports the wallet-interest route without
      monorepo links or manually installing Types.
- [ ] The checked smoke matrix permanently exercises the affected public
      subpath.
- [ ] Focused package, smoke, repository, whitespace, and scope gates pass.
- [ ] No wallet-interest behavior, payment contract, version, or publish
      authority changed.

## STOP conditions

Stop and report on unavailable Mail lockfile transfer; incomplete or conflicting
Plans 228/236 ownership; route source or export drift; any additional undeclared
runtime package exposed by the new smoke; Bun producing unrelated manifest or
lockfile churn that cannot be isolated; need to publish a dependency to run the
credential-free smoke; missing focused route test; or any mandatory gate failing
twice.

## Maintenance notes

Review future wildcard-exported APIs modules for executable dynamic imports;
type-only imports may remain development-only, but runtime imports must be
consumer-installable. Reviewers should verify the smoke resolves from the
installed tarball tree, because a workspace fallback recreates the original
false-green condition.
