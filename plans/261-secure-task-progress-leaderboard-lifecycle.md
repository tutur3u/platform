# Plan 261: Secure and Atomically Create Task Progress Leaderboards

> **Executor instructions:** Preserve member-visible leaderboard reads and the
> dedicated self join/leave flow, but require leaderboard ownership or
> `manage_projects` for roster/team administration and create the leaderboard
> plus creator membership in one transaction. Leave leaderboard item ownership
> to Plan 057.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/_utils.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** security / transactional integrity
- **Depends on:** Plans 057, 154, and 163; Tasks, database, and generated-type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The route auth helper proves only workspace membership and then exposes a
service-role client. Plan 057 already owns leaderboard item PATCH/DELETE, but
the separate roster/team routes still let any member add or rewrite arbitrary
members and create teams. Their authenticated RLS policies independently grant
every workspace member broad writes. Creation is also two commits: a
leaderboard can survive without its creator membership when the second insert
fails.

## Current state and required contract

- The members POST and teams POST mutate through `sbAdmin` after membership-
  only auth. Plan 057 separately creator-binds leaderboard item PATCH/DELETE.
- `20260625113400_add_task_progress_parity.sql` grants authenticated
  INSERT/UPDATE/DELETE and defines membership-wide `FOR ALL` policies for all
  three leaderboard tables.
- The collection POST inserts `task_leaderboards`, then separately inserts the
  creator into `task_leaderboard_members`.
- Keep collection POST available to an ordinary workspace member. That actor
  becomes `created_by` and the active creator member atomically.
- Administrative mutation here means members POST when it targets any user
  (including self through this admin route) and teams POST. It requires either
  `task_leaderboards.created_by = actor.id` or the actor's explicit
  `manage_projects` permission. The shared helper must call
  `getPermissions({ user: auth.user, wsId: auth.wsId })`, never ambient request
  or cookie auth, and fail closed when permissions are null. Return the existing
  sanitized 403 envelope before any admin mutation when neither condition holds.
- Keep GET routes membership-readable. Keep `leaderboards/join` POST/DELETE as
  the only ordinary-member self join/leave seam; it may not accept another
  `user_id` or administer teams.
- Add `private.create_task_leaderboard_with_creator_member(p_ws_id uuid,
  p_actor_id uuid, p_metric_id uuid, p_name text, p_period_start date,
  p_description text default null, p_period_end date default null,
  p_status text default 'active', p_starred boolean default false) returns uuid`.
  The SECURITY DEFINER function uses a fixed search path, validates an active
  MEMBER row for the actor and a non-archived metric in the same workspace,
  inserts both rows transactionally, and returns the new leaderboard id.
  Reuse the table constraints for field validation. Revoke the exact signature
  from PUBLIC/anon/authenticated and grant only service_role.
- After Plan 057 has settled `task_leaderboards`, drop/revoke authenticated
  INSERT on `task_leaderboards` so the RPC is the only create seam; preserve
  Plan 057's SELECT and owner-bound UPDATE/DELETE policies/grants. Also drop the
  broad authenticated team/member write policies and revoke authenticated
  INSERT/UPDATE/DELETE on `task_leaderboard_teams` and
  `task_leaderboard_members`; preserve their SELECT policies/grants.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute from the
completed Plan 163 isolated-validator base only after Plan 154 is green and the
Tasks/database/type owners transfer these paths. Read the nearest AGENTS files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/members/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/teams/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/join/route.test.ts'` | the new authorization and preserved self-service matrix passes |
| Focused database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/task-progress-leaderboard-lifecycle.sql` | fresh migration, ACL, RLS, atomicity, and generated types pass |
| Full database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP and isolated typegen pass |
| App typecheck/build | `bun type-check:tasks && bun run --cwd apps/tasks build` | Tasks compiles and builds |
| Repository | `bun check && git diff --check` | all checks pass; diff is whitespace-clean |

## Scope

In scope: the four leaderboard route files/tests above; a small shared
leaderboard-admin authorization helper under the existing task-progress
directory; one additive migration; one focused pgTAP file; generated Supabase
types; mechanical manifest updates only if required by repository policy.

Out of scope: Plan 057's leaderboard item PATCH/DELETE and base-table policy;
leaderboard ranking/hydration performance; metric semantics; gamification
behavior; UI redesign; join-code changes; or Rust traffic cutover. No Web route
changes are involved because Tasks owns this API.

## Steps

1. Add red route tests proving ordinary members can read/create/self-join/self-
   leave but cannot add/update a member through the admin route or create a
   team. Prove creator and `manage_projects` actors can perform each
   administrative action through both cookie and Tasks/CLI app-session auth,
   and denial/null permission occurs before any service-role mutation.
2. Extract one route-local authorization helper that loads the workspace-bound,
   non-archived leaderboard once and accepts creator or `manage_projects`.
   Preserve existing 404 behavior for missing/foreign/archived leaderboards and
   403 for a real but unauthorized leaderboard.
3. Add the exact private RPC and replace collection POST's two inserts with one
   RPC followed by the existing workspace-bound read/hydration. Map the known
   actor/metric validation failures to the existing 403/404 envelopes; all
   unclassified database errors remain sanitized 500s.
4. Replace only the leaderboard INSERT plus two team/member write
   policies/grants described above. Add pgTAP for policy inventory, direct
   authenticated leaderboard INSERT and team/member write denial, SELECT preservation,
   service-role ACL, valid atomic create, foreign actor/metric rejection, and a
   forced creator-member insert failure that leaves no leaderboard.
5. Run focused routes, focused/full isolated DB+typegen, Tasks typecheck/build,
   `bun check`, whitespace, and exact-scope review.

## Done criteria

- [ ] Ordinary members cannot administer another leaderboard roster/team through routes or direct SQL.
- [ ] Creator and `manage_projects` roster/team paths preserve current success envelopes.
- [ ] Self join/leave remains available only through the dedicated route.
- [ ] Direct authenticated INSERT cannot bypass the atomic create RPC.
- [ ] A create failure cannot leave a leaderboard without its creator member.
- [ ] SELECT policies remain intact and the private RPC is service-role-only.
- [ ] Focused/full DB, generated types, route, build, repository, and scope gates pass.

## STOP conditions

Stop on a non-service-role caller of the proposed RPC; an existing supported
direct authenticated write caller; inability to distinguish missing from
unauthorized without leaking cross-workspace existence; migration/type
ownership conflict; a red exact-base pgTAP baseline; or any mandatory gate
failing twice.
