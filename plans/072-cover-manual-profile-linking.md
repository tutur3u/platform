# Plan 072: Cover Manual Profile Linking and Manager Consolidation

> **Executor instructions:** Add focused behavioral coverage for the shared
> manual-link route without changing production behavior. Use faithful,
> ordered Supabase doubles and stop if a test exposes a product bug requiring a
> source fix.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/users-core/src/routes/users/links/manual/route.ts packages/users-core/src/routes/users/links/manual/route.test.ts apps/contacts/src/app/api/v1/workspaces/[wsId]/users/links/manual/route.ts apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/route-ownership.test.ts`
> Quote bracketed paths. Stop on route/auth/mutation drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Contacts production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted tests remain in
  `.worktrees/chore-manual-profile-linking-tests`
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** Test coverage
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

This route crosses a two-permission boundary, links platform and virtual
identities, and can move a teacher assignment with compensating writes. The
only Contacts coverage proves route ownership, so authorization, containment,
conflict, and rollback regressions can ship undetected.

## Current state

- `packages/users-core/src/routes/users/links/manual/route.ts:22-48` requires
  both `update_users` and `view_users_public_info` and resolves workspace aliases.
- `:153-213` checks that both identities belong to the workspace, recognizes an
  exact idempotent link, and rejects other link conflicts.
- `:215-295` consolidates a manager by upserting the linked virtual profile,
  deleting the source assignment, and compensating the upsert if deletion
  fails.
- `apps/contacts/src/app/api/v1/workspaces/[wsId]/users/links/manual/route.ts`
  re-exports the shared handler. The current route-ownership test does not call
  GET or POST.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm the active
Contacts database handoff still owns only its listed `users/database` paths.
This plan is characterization only: if a failing assertion proves a live bug,
report it and write a separate fix plan.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared route tests | `bun run --cwd packages/users-core test -- src/routes/users/links/manual/route.test.ts` | all new cases pass |
| Package types | `bun run --cwd packages/users-core type-check` | exit 0 |
| Contacts build | `bun run --cwd apps/contacts build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated pre-existing blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/users-core/src/routes/users/links/manual/route.test.ts` (create)
- `plans/README.md` only for the status row

Production handlers, UI, database functions, migrations, and response shapes
are out of scope.

## Git workflow

- Branch: `chore/manual-profile-linking-tests` in an isolated worktree; run
  `bun setup` immediately.
- Commit: `test(users): cover manual profile linking`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging.

## Steps

### Step 1: Build a route-level fixture

Mock `getUserGroupRoutePermissions`, workspace normalization, and
`createAdminClient` before importing the route. Use explicit per-table query
queues and mutation logs so each response and the absence/order of admin writes
can be asserted. Do not replace the route with a mocked facade.

### Step 2: Cover authorization and containment

Test missing access (404), each missing permission (403), invalid bodies (400),
missing virtual user/member containment (400), and group/source/target state
that disappeared before consolidation (409). Assert forbidden requests never
create an admin client or mutation.

### Step 3: Cover every link and consolidation outcome

Test ordinary insertion, exact-link idempotency, platform conflict, virtual
conflict, successful teacher consolidation, upsert failure, source-delete
failure with pre-existing target restoration, and source-delete failure with
new target deletion. Assert exact table operation order and response bodies.

### Step 4: Verify the production wrapper

Run the suite/typecheck and Contacts build. The build plus the existing
ownership test is the accepted proof that the thin re-export still compiles; do
not add a duplicate Contacts behavior suite.

## Test plan

The named cases in Steps 2-3 are mandatory. Use inert UUIDs and synthetic
emails only. Also assert unexpected read/mutation errors map to the existing
500 envelopes without leaking raw error text.

## Done criteria

- [ ] Every permission, containment, conflict, success, and compensation branch is covered.
- [ ] Tests assert mutation absence or exact ordering, not only status codes.
- [ ] No production file changed.
- [ ] Users-core typecheck, Contacts build, `bun check`, and whitespace pass.

## STOP conditions

Stop if live behavior contradicts the stated response contract, a branch cannot
be reached without changing production code, the active Contacts owner expands
into this route, or a required gate fails twice. Report the newly proven bug;
do not normalize it by weakening assertions.

## Maintenance notes

Keep this as the canonical suite for the shared handler. Satellite wrappers
should prove ownership/compilation rather than duplicate its full mutation
matrix.
