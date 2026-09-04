# Plan 107: Index Workspace API-Key Validation by Prefix

> **Executor instructions:** Add the non-unique partial index required by the
> live prefix-only lookup. Preserve collision-safe hash verification and all API
> key issuance/permission behavior.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/auth/src/api-keys.ts packages/auth/src/api-keys.test.ts apps/database/supabase/migrations apps/database/supabase/tests`
> Stop on API-key validation, prefix schema, or migration drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** the reviewed uncommitted work predates Plan 151 and must be
  replayed through its disposable validator; Plan 107's own pgTAP passes 3/3,
  but the mandatory full exact-base pgTAP baseline remains red on unrelated
  suites. Work remains in `.worktrees/perf-index-workspace-api-key-prefix`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** performance
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every TypeScript workspace API-key authentication queries only `key_prefix`,
but the only prefix index begins with `ws_id`. PostgreSQL cannot efficiently use
that composite index for the live predicate, so authentication can scan the key
table before performing deliberately expensive scrypt checks.

## Current state

- `packages/auth/src/api-keys.ts:130-145` extracts the first 12 characters and
  queries `workspace_api_keys` with only `.eq('key_prefix', keyPrefix)`.
- `20251022040001_enhance_workspace_api_keys.sql:64-69` creates only the partial
  unique `(ws_id, key_prefix)` index.
- `api-keys.ts:118-120,135-137` incorrectly describes a unique prefix-only index;
  runtime correctly treats results as candidates and verifies hashes serially.
- `packages/auth/src/api-keys.test.ts` already covers generation, hashing,
  candidate lookup, expiry, and permissions.

## Required skills and preflight

Load `$tuturuuu-database` and `$tuturuuu-agent-coordination`. Recheck active
migration ownership before creating a uniquely named additive migration. This
index does not change generated TypeScript database types.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new add_workspace_api_key_prefix_index` | one additive migration |
| Local apply | `bun sb:up` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | index contract test passes |
| Auth test | `bun run --cwd packages/auth test -- src/api-keys.test.ts` | validation suite passes |
| Auth typecheck | `bun run --cwd packages/auth type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- one additive migration creating the prefix-only partial index
- `apps/database/supabase/tests/workspace-api-key-prefix-index.sql`
- `packages/auth/src/api-keys.ts` comments only, plus its existing test if a
  query-shape assertion is needed
- `plans/README.md` only for status

Do not make prefixes globally unique, change prefix length/format, alter key
issuance, parallelize scrypt verification, or regenerate database types.

## Git workflow

Use branch `perf/index-workspace-api-key-prefix` in an isolated worktree and run
`bun setup`. Commit `perf(auth): index api key prefix lookup`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Capture the lookup/index mismatch

Before creating the migration, inspect `pg_indexes` and confirm there is no
existing index whose first key is `key_prefix`; stop if one exists. Then add a
pgTAP target assertion for a valid partial btree index whose first and only key
column is `key_prefix` and whose predicate excludes null prefixes. Keep the
existing composite unique index for per-workspace issuance semantics.

### Step 2: Add the additive index

Create a non-unique index named `idx_workspace_api_keys_key_prefix` on
`public.workspace_api_keys(key_prefix) WHERE key_prefix IS NOT NULL`. Use the
repository's rollout-safe migration convention and avoid a uniqueness audit or
constraint because prefix collisions are intentionally resolved by hash.

### Step 3: Prove planner eligibility and preserve collision handling

In the database test, seed enough inert synthetic rows for an `EXPLAIN` of the
exact `key_prefix = ...` predicate and assert the plan can select the new index
with sequential scans disabled for the test transaction. In Vitest, retain a
multi-candidate collision case proving every candidate is hash-checked until a
match and no candidate match returns null. Correct only the stale uniqueness
comments in runtime code.

### Step 4: Run gates

Apply locally, run database/auth tests and auth typecheck, then `bun check` and
whitespace validation. Confirm `git diff -- packages/types/src/supabase.ts` is
empty.

## Done criteria

- [ ] Prefix-only validation has a matching partial btree index.
- [ ] The composite unique index and collision-safe hash checks remain intact.
- [ ] Query-plan and multi-candidate regression tests pass.
- [ ] No generated DB type or public API behavior changes.
- [ ] Database apply/tests, auth tests/typecheck, repository gate, and whitespace pass.

## STOP conditions

Stop if an equivalent prefix-leading index now exists, production uses a
different predicate, the migration requires destructive duplicate cleanup, a
generated type changes, a new exact-path owner appears, or a gate fails twice.

## Maintenance notes

Prefix is an indexable candidate selector, not an authentication secret or
unique identity. Full hash verification must remain authoritative.
