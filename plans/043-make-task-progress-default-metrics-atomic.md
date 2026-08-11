# Plan 043: Authorize and Atomically Manage Task Progress Metrics

> **Executor instructions:** Keep Task Progress metric reads available to
> workspace members, but require `manage_projects` for every workspace-wide
> metric mutation. Remove privileged writes from read handlers and make default
> transitions transactional. Follow every gate and stop rather than weakening
> either the permission or database invariant.
>
> **Drift check (run first):**
> `git diff --stat 5af8af5d91..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/_utils.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/metrics' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/stats/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/goals/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/catchup/route.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on material metric schema, permission, fallback, route, database/type
> ownership, or active-owner drift.

## Status

- **Execution status:** BLOCKED — requires Plans 057/154/163 and exact database/type transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / correctness / concurrency
- **Depends on:** Plans 057, 154, and 163; Tasks/database/generated-type coordination
- **Planned at:** commit `5af8af5d91`, 2026-08-12

## Why this matters

The shared Task Progress auth helper proves only workspace membership and then
hands routes a service-role client. Any ordinary member can therefore create,
rename, archive, or replace workspace-wide metrics, and direct authenticated
Data API writes have the same authority. Reads also seed missing metrics with
that service-role client. Separately, default selection clears the current
default before the replacement write is known to succeed, so failures and
concurrency can leave zero or multiple defaults.

## Current state and exact contract

- `_utils.ts:123-154` resolves cookie or Tasks/CLI app-session identity,
  normalizes `wsId`, checks only `MEMBER` membership, then creates `sbAdmin`.
  Keep this member-level helper for Task Progress reads and per-user objects.
- `_utils.ts:157-188` performs service-role metric inserts from GET code.
  `metrics/route.ts:20-24`, `stats/route.ts:68-72`, `goals/route.ts:26-30`,
  `leaderboards/route.ts:24-28`, and `catchup/route.ts:182-186` all invoke it.
  Ordinary read requests must perform **zero** metric writes after this plan.
- The foundation migration seeds all workspaces existing at migration time at
  `20260625113400_add_task_progress_parity.sql:457-486`, but it has no trigger
  for workspaces created later. Add a migration-owner trigger that seeds the
  eight canonical rows for a newly inserted workspace with `created_by = null`.
  Backfill only workspaces with **no metric row at all, including archived
  rows**; do not recreate a metric that an administrator intentionally changed
  or archived.
- `metrics/route.ts:54-90`, `metrics/[metricId]/route.ts:16-82`, and
  `metrics/pack/route.ts:56-127` mutate the shared catalog after membership
  only. Before JSON parsing or any service-role query, require
  `getPermissions({ user: auth.user, wsId: auth.wsId })` and
  `containsPermission('manage_projects')`. Preserve the helper-consistent,
  fail-closed 403 for a null permission result or missing permission. This exact
  actor argument is required so cookie and app-session callers use the already
  resolved principal rather than ambient cookies.
- The migration's `task_progress_metrics_member_write` policy at lines 274-280
  allows every member to INSERT/UPDATE/DELETE. Replace it with separate
  permission-bound policies using
  `public.has_workspace_permission(ws_id, auth.uid(), 'manage_projects')` in
  both `USING` and `WITH CHECK`; retain member SELECT and the table grants.
- Creating or selecting a default currently clears peers in application code
  before insert/update. Add a partial unique index on `(ws_id)` where
  `is_default = true AND archived_at IS NULL`, plus service-role-only private
  create/switch functions that validate `p_actor_id` has `manage_projects`,
  lock the workspace metric set, validate the target first, and perform clear
  plus insert/update in one transaction. The route must not issue a separate
  clear query.
- Preserve the current product decision that zero active defaults is allowed
  after explicit unset/archive. This plan enforces **at most one**, not exactly
  one. Preserve member read envelopes, metric schemas/scoring, metric-pack
  contents, and 404 behavior.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read `apps/tasks/AGENTS.md` if present. Execute only after
Plan 057's per-user ownership policies and Plans 154/163's database baseline are
green. Obtain exact migration/generated-type transfer. Query duplicate active
defaults and workspaces without any metric history before adding constraints;
production application remains operator-owned.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-progress/metrics/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/metrics/[metricId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-progress/metrics/pack/route.test.ts'` | cookie/app-session member denial, manager success, read-only GET, and atomic RPC mappings pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-progress-metric-administration.test.sql --typegen packages/types/src/supabase.ts` | RLS, seed trigger, ACL, rollback, and concurrency cases pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated type generation is byte-identical |
| Tasks | `bun run --cwd apps/tasks type-check && bun run --cwd apps/tasks build` | Tasks compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope/size | `git status --short && find 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress' -name '*.ts' -print0 | xargs -0 wc -l | sort -n | tail -20` | only in-scope files changed; no substantially edited source exceeds 700 lines |

## Scope

**In scope:** the shared Task Progress auth/default helper; metric collection,
item, and pack routes plus focused tests; removal of the five named GET-side
seed calls; one additive seed/permission/default-transaction migration and
pgTAP suite; generated Supabase types.

**Out of scope:** per-user entry/goal/leaderboard ownership beyond the named
read-side call removal (Plan 057); import batching (Plan 309); metric scoring,
packs, UI, names, archived-history disposition, production migration
application, or Web/Rust migration artifacts (Tasks owns these routes).

## Git workflow

- Branch: `fix/authorize-task-progress-metrics` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): authorize metric administration`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging.

## Steps

1. Add failing route tests proving ordinary cookie and Tasks/CLI app-session
   members receive 403 before body parsing/admin queries for POST/PATCH/DELETE
   and metric-pack POST; managers succeed; member GET remains 200 and performs
   no insert/update. Model app-session identity assertions on adjacent Tasks
   route suites, not ambient cookie mocks.
2. Add pgTAP red cases for member SELECT, ordinary-member direct DML denial,
   manager direct DML success, foreign-workspace denial, new-workspace seeding,
   no reseed after historical archive, duplicate-default rejection, missing
   target rollback, injected failure rollback, and concurrent switches.
3. Add a focused `requireTaskProgressMetricAdministration(auth)` helper that
   calls `getPermissions` with `auth.user` and normalized `auth.wsId`. Invoke it
   before parsing or service-role access on every catalog mutation. Do not
   strengthen unrelated Task Progress endpoints in this plan.
4. Replace member-write RLS, add the new-workspace seed trigger and guarded
   zero-history backfill, then add the partial unique index and exact private
   create/switch functions. Revoke them from `PUBLIC`, `anon`, and
   `authenticated`; grant only `service_role`; validate actor, workspace, and
   metric IDs inside SQL despite route checks.
5. Route default creation/switch through the typed functions and delete the
   separate clear queries. Remove `ensureDefaultTaskProgressMetrics` from all
   five GET paths and delete the helper once no caller remains.
6. Regenerate types twice and run focused, Tasks build, repository, whitespace,
   exact-scope, and source-size gates.

## Test plan

- Create the three colocated metric route suites and
  `apps/database/supabase/tests/task-progress-metric-administration.test.sql`.
- Cover cookie and app-session managers, ordinary members, permission lookup
  null, malformed unauthorized bodies, valid writes, missing metrics,
  service-role RPC failures, and proof that read-only GET never writes.
- In pgTAP, use two workspaces and two authenticated actors; cover direct RLS,
  trigger/backfill boundaries, ACLs, rollback, and real concurrent default
  transitions.

## Done criteria

- [ ] Only actors with `manage_projects` can mutate metric definitions through routes or direct authenticated DML.
- [ ] Every Task Progress GET is read-only and new workspaces receive canonical metrics from the database lifecycle.
- [ ] At most one active default exists per workspace; failed or missing-target transitions preserve prior state.
- [ ] Cookie and app-session identity use the same explicit actor contract.
- [ ] All focused, isolated DB/typegen, Tasks build, repository, whitespace, scope, and size gates pass.

## STOP conditions

Stop on historical duplicate defaults or ambiguous zero-history workspaces
without operator disposition; a product decision choosing a permission other
than `manage_projects`; Plan 057 policy drift; active exact-path ownership; a
need to rewrite unrelated goal/leaderboard semantics; an existing Rust owner;
or a mandatory gate failing twice.

## Maintenance notes

Member reads and administrator catalog writes are deliberately separate. Keep
future metric packs and default operations behind the same permission and SQL
invariants, and never reintroduce catalog seeding as a service-role GET side
effect.
