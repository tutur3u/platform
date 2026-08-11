# Plan 110: Make Hive Mind Simulation Materialization Atomic

> **Executor instructions:** Materialize the NPC bundles and workflow produced
> by one Mind import inside one Hive Postgres transaction. Preserve standalone
> NPC/workflow APIs through thin wrappers and return no partial simulation on
> any validation or persistence failure.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/hive/src/app/api/v1/hive/servers/[serverId]/mind-simulations' apps/hive/src/lib/hive/npcs.ts apps/hive/src/lib/hive/workflow-store.ts apps/hive/src/lib/hive/workflows.ts apps/hive/src/lib/hive/mind-simulation-blueprint.ts tmp/agent-coordination`
> Stop on Mind-import, NPC-bundle, workflow-store, or exact-path ownership drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `c8d88a1ecc473d70dc00ef37b0a22997845d3edf`
  on branch `fix/hive-mind-materialization`; 12 focused tests, Hive
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness / test coverage
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route commits NPC bundles one at a time and creates the workflow later. A
failure can return 400/500 while leaving funded NPCs, wallets, needs, and ledger
grants behind. Retrying then duplicates those side effects.

## Current state

- `mind-simulations/route.ts:118-149` creates up to twelve NPCs independently
  and returns an error without cleaning up committed survivors.
- Workflow validation and insertion occur only after those writes at lines
  167-195.
- `npcs.ts:21-58` makes each NPC bundle atomic in its own `sql.begin`, while
  `workflow-store.ts:174-200` uses a separate top-level operation.
- Existing tests cover blueprint construction and client dispatch, not route
  materialization failures.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Read the Hive
DESIGN/AGENTS guidance and the existing Hive Postgres migration/runbook before
editing. No active note currently claims these exact paths; recheck immediately
before work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused store tests | `bun --cwd apps/hive vitest run src/lib/hive/mind-simulation-materializer.test.ts` | shared-transaction and rollback faults pass |
| Route tests | `bun --cwd apps/hive vitest run 'src/app/api/v1/hive/servers/[serverId]/mind-simulations/route.test.ts'` | status and no-residual-state cases pass |
| Hive typecheck | `bun run --cwd apps/hive type-check` | exit 0 |
| Hive build | `bun run --cwd apps/hive build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the Mind-simulation route and new focused route test
- a new `apps/hive/src/lib/hive/mind-simulation-materializer.ts` plus test
- transaction-aware insertion helpers in the existing NPC/workflow stores,
  retaining their public wrappers
- `plans/README.md` only for status

Do not redesign Mind graph projection, standalone NPC creation, workflow
execution, starter grants, or Hive schema.

## Git workflow

Use branch `fix/hive-mind-materialization` in an isolated worktree and run
`bun setup`. Commit `fix(hive): make Mind simulation imports atomic`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the transaction boundary

Add route/store tests for success, the second NPC bundle failing, fewer than two
NPCs surviving, workflow validation failure, and workflow insert failure. In
every failure case assert zero imported NPC, wallet, need, ledger, and workflow
rows remain; a retry creates exactly one graph.

### Step 2: Expose transaction-aware store primitives

Extract an internal `insertHiveNpcBundle(tx, input)` from `createHiveNpc` and an
internal `insertHiveWorkflow(tx, input)` from `createHiveWorkflow`. Existing
public functions must continue to establish their own transaction/top-level
operation for unrelated callers. Run schema readiness checks before entering
the materialization transaction, never from inside it.

### Step 3: Materialize one plan in one `sql.begin`

Move NPC insertion, id mapping, final definition construction/validation, and
workflow insertion into the new materializer's single transaction. Treat a
missing NPC or workflow row as an exception so Postgres rolls back. Return the
same success payload only after commit.

### Step 4: Keep errors deterministic

Map invalid input/board shape to the current 400 behavior before materializing.
Map persistence faults to the existing sanitized 500 response, and do not leak
database details. Run focused tests, typecheck, the Hive build, and `bun check`.

## Done criteria

- [ ] One successful request commits all NPC bundles and exactly one workflow.
- [ ] Any NPC, validation, or workflow fault leaves no imported side effects.
- [ ] Standalone NPC/workflow callers retain their public contracts.
- [ ] Retry after rollback creates one simulation, not duplicate grants.
- [ ] Focused tests, Hive typecheck/build, and repository gates pass.

## STOP conditions

Stop if exact-path ownership appears, store helpers cannot share the same
`postgres` transaction object without changing unrelated callers, or a test
cannot distinguish committed rows from mocked in-memory state.

## Maintenance notes

Compensation is not a substitute for a transaction when all writes already use
the same Hive Postgres database.
