# Plan 099: Make Meet Plan and Timeblock Edits Atomic

> **Executor instructions:** Commit the organizer's plan fields and every
> required user/guest timeblock adjustment in one database transaction. Never
> leave a plan window and its availability rows describing different states.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/apis/src/meet/actions/plans.ts 'apps/web/src/app/api/v1/meet/plans/[planId]' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration`
> Stop on Meet plan-edit, scheduling RPC, generated-type, or route-tracking
> drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness
- **Depends on:** G22 route-artifact ownership and generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`updatePlan` deletes and adjusts availability rows before updating the plan.
Any later timeblock or plan write failure returns an error after earlier writes
have committed, leaving the stored plan window inconsistent with participant
availability.

## Current state

- `packages/apis/src/meet/actions/plans.ts:27-90` executes grouped deletes and
  updates as separate database requests; partial success is not rolled back.
- `plans.ts:340-458` applies those requests before the plan mutation.
- `plans.ts:461-468` updates the plan separately, so its failure cannot undo
  the timeblock changes.
- The private scheduling RPC pattern in
  `20260801164359_meet_scheduling_revamp.sql` already locks plans, validates
  actors, revokes ordinary execution, and grants only `service_role`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Read the database and Web route instructions.
Remain blocked while G22 owns aggregate migration artifacts or another active
note owns generated database types. Reconcile Plan 051 if it changes the Meet
actor contract first.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new update_meet_plan_atomically` | one additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | transaction, privilege, and rollback cases pass |
| Local apply | `bun sb:up` | migration applies locally |
| Generated types | `bun sb:typegen` | only expected RPC/type changes |
| API tests | `bun run --cwd packages/apis test -- src/meet/actions/plans.test.ts` | plan/timeblock failure matrix passes |
| Web route tests | `bun run --cwd apps/web test -- 'src/app/api/v1/meet/plans/[planId]/route.test.ts'` | response mapping passes |
| API typecheck | `bun run --cwd packages/apis type-check` | exit 0 |
| Route tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | refreshed contract remains legacy-owned |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/apis/src/meet/actions/plans.ts` and
  `packages/apis/src/meet/actions/plans.test.ts`
- the first-class Meet plan item route and a colocated focused test
- one uniquely named migration and
  `apps/database/supabase/tests/update-meet-plan-atomically.sql`
- generated database types after the local migration is applied
- the existing exact Meet-plan route override and generated manifest
- `plans/README.md` only for status

Do not change plan creation, guest identity, finalization, polls, or the public
snapshot shape.

## Git workflow

Use branch `fix/atomic-meet-plan-edits` in an isolated worktree and run
`bun setup`. Commit `fix(meet): make plan edits atomic`. Claim the commit window
before staging; do not push unless instructed.

## Steps

### Step 1: Freeze the transition contract

Characterize unchanged fields, creator/non-creator, confirmed plan, invalid
time window, successful clipping, deletion for removed dates, and every failure
point. The HTTP response remains the current refreshed plan snapshot on success
and the established 401/400 envelope on denial or validation failure.

### Step 2: Add one trusted transactional RPC

Create a private `SECURITY DEFINER` function that accepts the server-resolved
actor ID, plan ID, and an allowlisted JSON update containing only `name`,
`dates`, `start_time`, `end_time`, `timezone`, `duration_minutes`,
`where_to_meet`, `description`, and `agenda_content`. Return exactly
`{ "planId": <uuid>, "updated": true }` on success. Revoke it from `PUBLIC`,
`anon`, and `authenticated`; grant only `service_role`; set an empty search
path and fully qualify objects. Lock the plan row, require the actor to be its
creator, reject confirmed plans, compute/validate the effective dates and
times, update or delete both user and guest timeblocks, and update the plan in
one transaction. Do not accept table names or arbitrary columns from JSON.

### Step 3: Replace request choreography

Have the action resolve the actor server-side and call only the RPC for plan
edits. Remove `executeBatchOperations` if no caller remains. Keep validation
and route response mapping thin and deterministic.

### Step 4: Prove rollback and privilege boundaries

Use pgTAP fault cases or constraint-triggered failures to prove no plan or
timeblock row changes when any part fails. Prove ordinary database roles cannot
invoke/spoof the actor ID. Refresh types and the existing route-tracking note,
then run focused tests and build.

## Done criteria

- [ ] Plan fields and all affected timeblocks commit or roll back together.
- [ ] The RPC locks the plan and validates the server-resolved creator.
- [ ] Ordinary database roles cannot invoke or spoof the trusted RPC.
- [ ] Existing success and denial response contracts remain stable.
- [ ] Database, API, route, type, manifest, build, and repository gates pass.

## STOP conditions

Stop until named ownership is released, if Plan 051 changes actor resolution,
if any update field cannot be safely allowlisted, if a historical plan violates
the required invariants, or if a required gate fails twice.

## Maintenance notes

Scheduling-window changes are one domain transition. Keep organizer fields and
participant availability behind the same locked database boundary.
