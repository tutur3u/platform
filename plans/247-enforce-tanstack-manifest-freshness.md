# Plan 247: Enforce TanStack Migration Manifest Freshness

> **Executor instructions:** Make stale TanStack route ownership fail the
> canonical repository and Rust/TanStack CI gates. Reuse the existing read-only
> manifest and README checkers; do not regenerate or reinterpret ownership as
> part of verification.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- scripts/check.js scripts/check.test.js scripts/tanstack-migration-manifest.js scripts/tanstack-migration-manifest.test.js scripts/tanstack-migration-progress.js scripts/tanstack-migration-progress.test.js scripts/ci/check-workflow-config.test.js .github/workflows/rust-backend.yml apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json README.md apps/docs/platform/architecture/tanstack-rust-migration.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the G22 coordinator currently owns the
  generated manifest, overrides, README, and migration docs; the native-CI
  handoff owns the Rust workflow
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** migration / DX / CI
- **Depends on:** exact G22 manifest/docs transfer and native-CI workflow
  transfer; no implementation dependency on Plan 161
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The repository already has a precise checker for route inventory, ownership,
method, progress, and accepted-removal drift, but neither canonical `bun check`
nor the Rust/TanStack workflow invokes it. A route or override can therefore
merge with a stale generated manifest, after which migration dashboards,
cutover decisions, and mobile mapping consume plausible but incorrect ownership
data. The audited snapshot passes the standalone checker; this plan makes that
truth an enforced invariant rather than a manual convention.

## Current state and exact contract

- `package.json:213-218` exposes manifest generation/checking and README progress
  commands. Do not add or change root scripts; call the existing Node CLIs
  directly from gates.
- `scripts/tanstack-migration-manifest.js:306-360` compares current inventory
  with the checked manifest and reports missing/stale IDs, summary/progress
  drift, method drift, status drift, and target-owner drift.
- The canonical command is exactly
  `node scripts/tanstack-migration-manifest.js check --manifest apps/tanstack-web/migration/route-manifest.json --allow-legacy`.
  `--allow-legacy` is required during migration; do not substitute the final
  `--require-migrated` cutover gate.
- The README dashboard check is exactly
  `node scripts/tanstack-migration-progress.js --check-readme --manifest apps/tanstack-web/migration/route-manifest.json`.
- `scripts/check.js:305-314` registers TanStack API-access and legacy-wrapper
  checks, while `scripts/check.js:424-439` ends with migration timestamp
  validation; no manifest or README freshness check is registered.
- `.github/workflows/rust-backend.yml:181-194` tests the route-tree generator,
  typechecks, and tests TanStack, but does not validate the generated migration
  manifest or README block.
- `scripts/check-mobile-api-mappings.js:112-117` trusts the checked manifest as
  an input; it does not prove the file matches live routes/overrides.
- Plan 161 defines durable accepted-removal evidence, while this plan only
  enforces freshness of the existing model. Do not expand the ownership schema
  or migrate route statuses here.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`; read their complete
CI/tooling references. Obtain exact transfer from
`tmp/agent-coordination/20260707-141449-codex-g22-time-roles-templates.md`, whose
status is `working` and whose coordinator owns
`apps/tanstack-web/migration/route-manifest.json`,
`apps/tanstack-web/migration/route-overrides.json`, `README.md`, and the
migration docs. Obtain workflow transfer from
`tmp/agent-coordination/20260710-142120-native-ci-cache-artifacts.md`, status
`handoff`, before editing `.github/workflows/rust-backend.yml`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Manifest baseline | `node scripts/tanstack-migration-manifest.js check --manifest apps/tanstack-web/migration/route-manifest.json --allow-legacy` | prints `TanStack migration route manifest is current.` and exits 0 |
| README baseline | `node scripts/tanstack-migration-progress.js --check-readme --manifest apps/tanstack-web/migration/route-manifest.json` | prints `README migration progress is current.` and exits 0 |
| Canonical gate tests | `node --test scripts/check.test.js scripts/tanstack-migration-manifest.test.js scripts/tanstack-migration-progress.test.js` | job registration and stale/current fixtures pass |
| Workflow contract | `node --test scripts/ci/check-workflow-config.test.js` | Rust/TanStack workflow contains both freshness steps before TanStack typecheck |
| YAML | `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/rust-backend.yml')"` | exits 0 |
| Repository | `bun check && git diff --check` | all gates pass, including both new canonical freshness jobs |
| Scope | `git status --short` | only approved implementation paths are modified; generated manifest/README are unchanged |

## Scope

**In scope:** `scripts/check.js`; `scripts/check.test.js`;
`scripts/tanstack-migration-progress.test.js` (create);
`.github/workflows/rust-backend.yml`;
`scripts/ci/check-workflow-config.test.js`; the focused migration architecture
doc only if needed to state that both gates are automatic.

**Read-only verification inputs:** `scripts/tanstack-migration-manifest.js` and
its tests; `scripts/tanstack-migration-progress.js`;
`apps/tanstack-web/migration/route-manifest.json`;
`apps/tanstack-web/migration/route-overrides.json`; `README.md`.

**Out of scope:** regenerating the manifest or README; changing overrides,
statuses, target owners, accepted-removal evidence, route implementations,
mobile mappings, cutover thresholds, root package scripts, workflow triggers,
deployment jobs, or Plan 161's ownership model.

## Git workflow

- Use an isolated `.worktrees/` checkout and run `bun setup` immediately.
- Branch: `chore/enforce-tanstack-manifest-freshness`.
- Claim `bun git-commit-window` before staging or committing and release it
  afterward. Commit with `chore(ci): enforce migration manifest freshness`.
- Do not push, open a PR, regenerate artifacts, or run `bun git-sync` unless
  instructed.

## Steps

1. Obtain both ownership transfers, run the standalone Manifest and README
   baseline commands, and save
   `git diff --exit-code -- apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json README.md`
   as the immutable generated-artifact baseline. If either checker fails, stop:
   this plan adds enforcement and does not repair drift.
   **Verify:** both baseline commands exit 0 and the generated-artifact diff is
   empty.
2. Add two unconditional checks to the static `checks` array in
   `scripts/check.js`, before `script-tests`: one invokes the exact manifest
   command with `--allow-legacy`; the other invokes the exact README command.
   Give them distinct stable names and concise success summaries. Do not
   condition them on changed paths; existing stale generated state must block
   any `bun check`.
   **Verify:** add `scripts/check.test.js` assertions modeled on
   `assertCheckBeforeScriptTests` proving both names, exact arguments,
   unconditional inclusion, and ordering; Canonical gate tests pass.
3. In `.github/workflows/rust-backend.yml`'s `verify-tanstack-web` job, add
   separate manifest and README freshness steps after dependency installation
   and before TanStack typecheck. Use the same direct Node commands as the root
   gate. Do not generate files or use `--require-migrated`.
   **Verify:** extend `scripts/ci/check-workflow-config.test.js` to parse the
   workflow and assert the exact two commands occur before the typecheck step;
   Workflow contract and YAML commands pass.
4. If the migration architecture doc currently describes freshness as manual,
   update only that focused statement to name automatic `bun check` and
   Rust/TanStack CI enforcement. Do not change route counts, ownership claims,
   or migration direction.
   **Verify:** `rg -n 'migration:tanstack:check|check-readme|manifest freshness' apps/docs/platform/architecture/tanstack-rust-migration.mdx`
   returns the updated executable contract; skip the doc edit if no stale claim
   exists.
5. Prove failure behavior without touching tracked artifacts. Reuse the existing
   manifest temporary-fixture tests for route ownership. Create
   `scripts/tanstack-migration-progress.test.js`, modeled on the manifest test's
   `node:test`/temporary-directory structure, with current and stale README
   dashboard fixtures. Mutate one route status and one dashboard total only in
   temporary copies, then confirm each checker exits nonzero with its expected
   stale message. Never modify the real generated files for a red test.
   **Verify:** Canonical gate tests cover current, stale route ownership, and
   stale README fixtures and pass.
6. Run repository, whitespace, scope, and generated-artifact immutability gates.
   Record exact verification in the coordination note and commit only approved
   implementation paths.
   **Verify:** Repository and Scope commands pass, and
   `git diff --exit-code -- apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json README.md`
   exits 0.

## Test plan

- In `scripts/check.test.js`, assert both checks are unconditional, precede
  script tests, and preserve `--allow-legacy` plus the explicit manifest path.
- Reuse the existing manifest/progress temporary-fixture tests for missing,
  stale, and current data; do not mutate repository artifacts.
- In `scripts/ci/check-workflow-config.test.js`, assert both commands and their
  ordering before TanStack typecheck so a future workflow refactor cannot drop
  them silently.
- Run full `bun check` to prove the canonical invocation executes both jobs on
  the clean current snapshot.

## Done criteria

- [ ] Every `bun check` validates route-manifest and README-dashboard freshness
      against live routes and overrides.
- [ ] Rust/TanStack CI runs the same two read-only checks before app typecheck.
- [ ] Stale route ownership and stale README fixtures fail deterministically;
      current fixtures pass.
- [ ] `--allow-legacy` remains the ordinary freshness policy and final cutover
      semantics are unchanged.
- [ ] No manifest, override, README, route, ownership, or deployment artifact
      is regenerated or changed.
- [ ] Focused, workflow, YAML, repository, whitespace, and scope gates pass.

## STOP conditions

Stop and report on missing G22 or native-CI transfer; either standalone baseline
checker failing at the execution base; need to regenerate a tracked artifact;
pressure to replace `--allow-legacy` with `--require-migrated`; workflow changes
beyond the `verify-tanstack-web` verification steps; ownership-schema or route
implementation changes; root manifest edits; or any mandatory gate failing
twice.

## Maintenance notes

Keep generation and checking separate: generators are explicit maintenance
commands, while canonical gates must remain read-only. When route ownership or
README dashboard formats evolve, update the generator, checker, fixtures, root
gate, and Rust/TanStack workflow in one reviewed tooling change so no consumer
trusts a stale compatibility artifact.
