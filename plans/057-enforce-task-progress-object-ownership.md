# Plan 057: Enforce Task-Progress Object Ownership

> **Executor instructions:** Prevent workspace members from mutating another
> user's entries, goals, or leaderboards through service-role routes or DELETE
> policies, while preserving workspace-wide read visibility.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/entries/[entryId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/goals/[goalId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/_utils.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on material Task Progress ownership or policy drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Object authorization
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo lanes retain generated database
type ownership. This plan explicitly scopes `packages/types/src/supabase.ts` and
cannot safely run typegen through those owners.

## Why this matters

Task Progress item handlers authenticate only workspace membership, then use the
admin client to update or archive any object ID in that workspace. The original
all-command RLS policies also use membership in their `USING` clause, so DELETE
can remove another user's entry, goal, or leaderboard even without the routes.

## Current state

- `resolveTaskProgressRouteAuth` verifies membership and returns `sbAdmin`.
- Entry PATCH/DELETE filter by `id`, `ws_id`, and deleted state but not
  `created_by = auth.user.id`.
- Goal PATCH/DELETE omit `owner_id = auth.user.id`; leaderboard PATCH/DELETE
  omit `created_by = auth.user.id`.
- `20260625113400_add_task_progress_parity.sql:282-337` creates `FOR ALL`
  policies whose `USING` predicate is workspace membership and whose
  `WITH CHECK` contains creator/owner identity. That blocks some foreign UPDATE
  results but does not protect DELETE.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`.
Confirm with product/UI callers that entries and goals are owner-managed and
leaderboards are creator-managed; workspace-wide GET visibility remains in scope.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Item route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-progress/entries/[entryId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/goals/[goalId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/route.test.ts'` | owner/foreign cases pass |
| Database apply | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | owner policies pass |
| Database types | `bun sb:typegen` | generated types remain current |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- The three item route modules and focused tests named above
- A small shared ownership helper near Task Progress `_utils.ts` if it prevents
  divergent predicates without substantially enlarging the 513-line file
- One additive policy migration,
  `apps/database/supabase/tests/task-progress-object-ownership.sql`, and generated types

Do not change workspace-wide reads, metric administration, leaderboard join/team
semantics, scoring, gamification, or UI.

## Git workflow

- Branch: `fix/task-progress-object-ownership` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): enforce progress object ownership`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Make route predicates fail closed

Add `created_by = actor` to entry and leaderboard mutations and
`owner_id = actor` to goal mutations before `.select(...).maybeSingle()`.
Return the existing non-disclosing 404 when the object is absent, foreign, or
owned by another member. Never fetch foreign content just to distinguish cases.

### Step 2: Split RLS read and write policies

Keep SELECT membership-wide if that is the confirmed product contract. Replace
each `FOR ALL` write policy with explicit INSERT, UPDATE, and DELETE policies:
INSERT/UPDATE must preserve the actor ownership column, and UPDATE/DELETE
`USING` must require both workspace membership and ownership. Do not broaden
service-role grants.

### Step 3: Sequence default-metric work

After this plan lands, execute Plan 043. Update Plan 043's drift comparison if
the shared Task Progress helper or migration baseline changed; do not combine
the authorization and default-selection migrations into one review.

## Test plan

For each object type cover owner update/delete, another member's object,
foreign-workspace object, missing object, malformed body, and database error.
pgTAP must prove membership-wide SELECT remains, nonowner UPDATE/DELETE fail,
owner writes succeed, and owner columns cannot be reassigned.

## Done criteria

- [ ] Item mutations require the persisted creator/owner to equal the actor.
- [ ] RLS independently rejects cross-user UPDATE and DELETE.
- [ ] Workspace-wide reads remain unchanged and explicitly tested.
- [ ] Route/database tests, reset/typegen, typecheck, repository gate, build, and whitespace pass.

## STOP conditions

Stop if leaderboard editing is intentionally collaborative, if managers need an
approved override not represented in the current permission model, or if
historical rows have null/invalid ownership requiring operator disposition.

## Maintenance notes

Service-role routes must restate ownership predicates. RLS remains the backstop
for direct authenticated access and must use ownership in both `USING` and
`WITH CHECK` where appropriate.
