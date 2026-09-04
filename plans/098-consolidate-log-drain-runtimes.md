# Plan 098: Consolidate Copied Log-Drain Runtimes

> **Executor instructions:** Establish a server-only contract and migrate
> consumers incrementally behind stable re-exports. Do not revive automatic
> console interception or app-local runtime DDL.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/*/src/lib/infrastructure/log-drain.ts packages/inventory-core/src/lib/infrastructure/log-drain.ts apps/*/src/lib/api-auth.ts packages/inventory-core/src/lib/api-auth.ts packages/*/package.json bun.lock`
> Stop on observability contract, dependency, or multi-owner drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** L
- **Risk:** HIGH
- **Category:** architecture
- **Depends on:** explicit multi-owner observability consolidation lane
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Eleven applications/packages carry byte-identical copies of a 914-line
Postgres/context log-drain runtime. Many auth modules import only the context
setter, yet compile and maintain schema creation, SQL persistence, wrappers,
and console-drain exports too; every safety/retention fix has eleven sites.

## Current state

- identical copies exist in Tasks, Learn, Track, Calendar, Web, Inventory,
  Mind, Hive, Teach, Infrastructure, and Inventory Core.
- the copies include runtime DDL near lines 95+, context setters near 790, and
  request/cron/console exports through roughly line 890.
- representative `api-auth.ts` callers import only `setLogDrainUserContext`.
- repository policy requires native `console.*` and prohibits automatic
  console drains and `serverLogger` runtime imports.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`, and coordination.
This spans several active owners and `bun.lock`; do not execute until an
explicit consolidation lane lists every owned path and sequencing agreement.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Duplicate inventory | `find apps packages -path '*/src/lib/infrastructure/log-drain.ts' -type f -print0 | xargs -0 shasum` | migrated copies disappear incrementally; remaining hashes intentional |
| Shared tests | `bun run --cwd packages/observability test` | context/persistence contracts pass |
| Shared typecheck | `bun run --cwd packages/observability type-check` | exit 0 |
| Pilot tests | `bun --cwd apps/mind vitest run src/lib/api-auth.test.ts && bun --cwd apps/hive vitest run src/lib/api-auth.test.ts` | context-only pilot contracts pass |
| App typechecks | `for app in tasks learn track calendar web inventory mind hive teach infrastructure; do bun run --cwd "apps/$app" type-check || exit 1; done` | all ten app typechecks exit 0 |
| Core typecheck | `bun run --cwd packages/inventory-core type-check` | exit 0 |
| App builds | `for app in tasks learn track calendar web inventory mind hive teach infrastructure; do bun run --cwd "apps/$app" build || exit 1; done` | all ten app builds exit 0 |
| Repository | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- new private workspace package `packages/observability/` with
  `src/log-drain-context.ts`, `src/log-drain-persistence.ts`, explicit
  server-only subpath exports, and focused tests
- the eleven copied modules and exact callers migrated in reviewed slices
- owning package manifests changed only through `bun add/remove`, plus lockfile
- focused contract tests, operational docs, and README status

Do not change log retention, destinations, severity, secret redaction, or add
console monkey-patching/serverLogger imports.

## Git workflow

After coordinated transfer, use `refactor/shared-log-drain-runtime` in an
isolated worktree and run `bun setup`. Commit each consumer migration
separately; claim/release the commit window for every commit.

## Steps

1. Inventory every export/import and characterize request context, cron
   context, failure isolation, redaction, and persistence. Classify consumers
   as context-only, persistence, or dead.
2. Create private `@tuturuuu/observability` in `packages/observability/`. Export
   `./log-drain-context` and `./log-drain-persistence` as explicit server-only
   subpaths. The context module owns AsyncLocalStorage and user/request/cron
   enrichment only. The persistence module owns the injectable SQL adapter;
   runtime request paths must not create schema.
3. Migrate Mind and Hive first as the exact context-only pilot, retaining thin
   local re-exports and running the two named tests/typechecks/builds. After the
   pilot passes, migrate Tasks, Learn, Track, Calendar, Web, Inventory, Teach,
   Infrastructure, and Inventory Core one owner-approved consumer per commit.
4. Add `@tuturuuu/observability` with `bun add` from every owning workspace and
   remove obsolete direct persistence dependencies with `bun remove`; never
   hand-edit dependency fields.
   Update operations docs and prove no automatic console mutation or forbidden
   logger import was introduced.

## Done criteria

- [ ] One tested server-only context contract replaces all identical copies.
- [ ] Persistence/DDL, if retained, has one explicit owner and no request-time schema creation.
- [ ] Native console severity/redaction behavior remains unchanged.
- [ ] Every migrated consumer test/build and `bun check` passes.
- [ ] Manifests/lockfile were changed mechanically with no unrelated drift.

## STOP conditions

Stop without explicit multi-owner transfer, if consumers require incompatible
retention semantics, if a shared module would enter client bundles, if the
lockfile is owned, or any consumer gate fails twice.

## Maintenance notes

This is a staged consolidation, not a flag-day rewrite. Retain thin re-exports
until all callers and operational docs migrate.
