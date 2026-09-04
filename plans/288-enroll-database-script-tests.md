# Plan 288: Enroll Every Database Script Test

> **Executor instructions:** Finish Plan 004's discovery contract for
> `apps/database/scripts/**`. Normalize the one Vitest-only suite to
> `node:test`, then discover the directory instead of maintaining individual
> filenames.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- scripts/run-script-tests.js scripts/run-script-tests.test.js apps/database/scripts package.json scripts/check.js .github/workflows/turbo-unit-tests.yaml tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / test discovery / database tooling
- **Depends on:** completed Plan 004
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Canonical `bun check` discovers script tests only through
`scripts/run-script-tests.js`. That runner hardcodes four database files and
silently omits three executable suites, so regressions in local Supabase docs,
bundled CLI resolution, and post-reset retry handling can merge green.

## Current state and exact contract

- The runner recursively discovers `scripts/**` but lists four individual
  `apps/database/scripts/*.test.js` supplemental paths. The directory contains
  seven suites. `--list` omits `local-supabase-docs.test.js`,
  `run-supabase.test.js`, and `post-reset-ai-credits.test.js`.
- The first two omitted files already use `node:test`. Convert
  `post-reset-ai-credits.test.js` from Vitest's `describe/it/afterEach` to
  `node:test` while preserving its two assertions and per-test restoration.
  Do not add a dependency or package test script.
- Replace the four individual database supplemental paths with the single
  directory root `apps/database/scripts`. Existing recursive discovery and
  exclusions then select all seven current `.test.js`/`.test.mjs` files and any
  future eligible database script test automatically.
- Extend `scripts/run-script-tests.test.js` with a repository-contract case that
  compares discovered `apps/database/scripts` test paths against a direct
  recursive eligible-file inventory. It must fail if a test is omitted, an
  explicit individual database filename returns, or an excluded fixture is
  enrolled.
- Preserve the existing `node --test` runner, sorted paths, `--list`, root
  `test:scripts`, `bun check`, and CI wiring. Do not create a second canonical
  database test gate.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Discovery | `node scripts/run-script-tests.js --list | rg '^apps/database/scripts/.+\.test\.(js|mjs)$'` | all seven database script suites print in sorted order |
| Runner contract | `node --test scripts/run-script-tests.test.js` | directory discovery, exclusions, and repo inventory pass |
| Database suites | `node --test apps/database/scripts/*.test.js` | all seven database script files execute under Node and pass |
| Canonical script suite | `bun run test:scripts` | every discovered repository script test passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** `run-script-tests.js` supplemental discovery; its existing test;
the test-framework-only conversion of `post-reset-ai-credits.test.js`.

**Out of scope:** production database scripts; Supabase startup/reset behavior;
docs content; package manifests; dependencies/lockfile; GitHub workflow wiring;
non-hermetic database integration/pgTAP suites; changing Plan 004's runner.

## Steps

1. Run `--list` and record the three omitted paths. Run the two Node suites and
   the focused Vitest suite before conversion; STOP on a product failure rather
   than weakening assertions.
2. Convert only the post-reset test's harness imports/lifecycle to `node:test`.
   Keep both retry/non-retry cases, fake fetch, fake key, and cleanup exact.
3. Replace the four literal database supplemental files with the directory.
   Add a red fixture/repository contract proving full eligible discovery,
   deterministic sorting, exclusions, and no duplicate paths.
4. Run the focused runner, all seven database files through Node, canonical
   `test:scripts`, `bun check`, whitespace, and exact-scope review.

## Done criteria

- [ ] `--list` contains every eligible database script test, including the
      three previously omitted suites, exactly once and in sorted order.
- [ ] Future eligible `apps/database/scripts/**/*.test.{js,mjs}` files require
      no runner configuration edit.
- [ ] The post-reset retry suite runs under the canonical Node test process with
      unchanged behavior.
- [ ] No dependency, manifest, lockfile, workflow, production script, or docs
      content changes are made.
- [ ] Focused, canonical script, repository, and whitespace gates pass.

## STOP conditions

Stop on a new exact-path owner; any discovered database test requires live
credentials/network/local Supabase; Node conversion changes assertions or
production exports; directory discovery enrolls generated/fixture/integration
tests; Plan 004's runner contract has changed; or a mandatory gate fails twice.

## Maintenance notes

This is a correction to the completed Plan 004 discovery promise. Directory
discovery is the durable contract; a longer hardcoded supplemental list would
repeat the defect.
