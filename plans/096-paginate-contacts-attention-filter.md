# Plan 096: Paginate Contacts Attention Filtering in the Database

> **Executor instructions:** Make the attention predicate part of the canonical
> paginated query. Do not materialize a workspace and slice it in application
> memory.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/users-core/src/routes/users/database.ts 'apps/contacts/src/app/api/v1/workspaces/[wsId]/users/database' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on Contacts database/filter or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** performance / correctness
- **Depends on:** Contacts database and migration ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The “requires attention” filter disables database pagination, loads the entire
returned workspace, computes attention IDs, filters/slices in memory, and then
computes attention again for the visible page. Cost grows with all contacts and
backend row ceilings can omit matches and corrupt totals.

## Current state

- `packages/users-core/src/routes/users/database.ts:186-224` applies `.range`
  only when `requireAttention` is absent.
- `:239-260` loads attention IDs for every materialized row, filters, counts,
  and slices the requested page in JavaScript.
- `:280-301` calls the attention helper again for visible IDs.
- the Contacts wrapper test mocks the core handler and cannot catch query-shape
  or pagination regressions.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and coordination. This is
blocked by `20260711-163000-codex-contacts-database-prod-error.md` and active
migration/generated-type owners. Obtain exact transfer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Migration | `bun sb:new paginate_workspace_users_attention` | one additive migration |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | attention paging pgTAP passes |
| Apply/typegen | `bun sb:up && bun sb:typegen` | exit 0 |
| Core tests | `bun run --cwd packages/users-core test -- src/routes/users/database.test.ts` | bounded query/count suite passes |
| Contacts tests | `bun --cwd apps/contacts vitest run 'src/app/api/v1/workspaces/[wsId]/users/database/route.test.ts'` | wrapper integration passes |
| Contacts build | `bun run --cwd apps/contacts build` | exit 0 |
| Repository | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- users-core Contacts database handler and focused test
- Contacts wrapper integration test
- one additive canonical workspace-user RPC migration/pgTAP suite
- generated database types and README status

Do not change the attention definition, ordering, archive/group/link/search
semantics, UI layout, or profile-link candidate search (Plan 073).

## Git workflow

After transfer, use `perf/contacts-attention-pagination` in an isolated worktree
and run `bun setup`. Commit `perf(contacts): paginate attention filtering`.

## Steps

1. Characterize the exact attention predicate with matches beyond page one and
   beyond the normal backend row ceiling, combined with every existing filter.
2. Add the predicate/flag to the canonical RPC so filtering, exact count,
   ordering, and range occur in the database. Preserve current page/limit bounds.
3. Enrich only returned IDs and reuse the returned attention flag; remove both
   full-set materialization and duplicate helper lookup.
4. Apply/typegen, run database/core/wrapper tests, Contacts build, and `bun check`.

## Done criteria

- [ ] Attention filtering stays database-paginated with accurate totals.
- [ ] Matches after page one/backend ceilings remain reachable.
- [ ] Attention IDs are not computed twice.
- [ ] Database, focused tests, Contacts build, and repository gates pass.

## STOP conditions

Stop until exact ownership transfers, if the attention predicate is not stable,
historical data violates the RPC assumptions, or a gate fails twice.

## Maintenance notes

New workspace-user filters must compose inside the canonical paginated query;
never bypass `.range` and reconstruct pagination in memory.
