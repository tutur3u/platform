# Plan 038: Make Track Pause and Resume Transitions Atomic

> **Executor instructions:** Treat pausing for a break and resuming as
> transactional state transitions. A failed second write must never leave a
> closed break without a resumed session, or a stopped session without its
> active break record.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/track/src/app/api/v1/workspaces/'[wsId]'/time-tracking/sessions apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on material timer-chain, pending-approval, or session uniqueness drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Bug / Concurrency / State integrity
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo lanes retain generated database
type ownership. The transactional RPC requires local type generation and an
update to `packages/types/src/supabase.ts`.

## Why this matters

Resume closes the active break before inserting the new running child session.
Pause stops the session before inserting the break and relies on a best-effort
rollback. A conflict, transient error, or concurrent request can therefore
leave the timer chain in a state the UI cannot accurately recover.

## Current state

- `actions/resume.ts:21-45` closes the active break, then lines 47-74 insert the
  resumed running session as a separate commit.
- The partial unique index in
  `20250601132359_add_time_tracking.sql:79-81` permits only one running session
  per workspace/user, so an existing or concurrent running session can reject
  that insert after the break was closed.
- `actions/pause.ts:75-96` calls `pause_session_for_break`, then separately
  inserts the break. Lines 98-117 attempt a non-transactional rollback whose
  own failure is only logged.
- No focused action test currently exercises `handleResumeAction` or a failed
  pause rollback.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$supabase-postgres-best-practices`. Inspect the full session-chain and pending
approval migrations before specifying locks and expected-state predicates.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database reset | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Type generation | `bun sb:typegen` | generated types match local schema |
| Action tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/actions/actions.test.ts'` | concurrency/failure cases pass |
| Existing sessions tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.test.ts'` | all pass |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- An additive database migration for atomic pause/resume operations, pgTAP
  coverage, and regenerated DB types
- Track pause/resume action helpers, their route wiring, and one focused action
  test file

Do not redesign timer UI, categories, break-type administration, historical
duration repair, or approval policy.

## Git workflow

- Branch: `fix/track-atomic-pause-resume` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(track): make pause resume atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Define valid transitions

Characterize running, paused-with-active-break, resumed-child, already-resumed,
pending-approval, and conflicting-running-session states. Define idempotent
responses for duplicate pause/resume and reject stale parent-session requests
with an expected-state conflict.

### Step 2: Add transactional database operations

Replace the split pause-with-break flow with one operation that locks the
session, validates ownership/workspace/current state, stops it, and inserts the
active break atomically. Replace resume with one operation that locks the
parent and break, proves no conflicting running session, closes the break, and
creates the child in one transaction. Preserve the unique index as a final
invariant, not the primary concurrency protocol. Put both functions in
`private` and revoke execution from `PUBLIC`, `anon`, and `authenticated`;
validate actor, workspace, ownership, session, and break ids inside each
transaction rather than trusting route-supplied parameters.

### Step 3: Simplify handlers and error mapping

Make the helpers call the atomic operations and fetch/return the committed
shape. Remove manual rollback. Map stale/duplicate/conflict results explicitly
and retain threshold and pending-approval behavior.

## Test plan

- Add `apps/database/supabase/tests/time-tracking-pause-resume.sql` for atomic
  success, injected failure rollback, duplicate calls, stale state, and
  concurrent resume conflict.
- Add the named action test with deferred database promises proving no partial
  state is exposed as success.
- Preserve current response fields including break duration and relationships.

## Done criteria

- [ ] Pause and resume each commit all state changes or none.
- [ ] Duplicate/concurrent requests have deterministic idempotent/conflict behavior.
- [ ] Manual application-level rollback is removed.
- [ ] Transaction functions are server-only and validate all affected identities.
- [ ] DB reset/typegen, tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if existing malformed timer chains require repair before constraints can
be added, if pending-approval semantics disagree across callers, or if another
active owner claims these exact actions or migration artifacts.

## Maintenance notes

Keep all future timer-chain transitions at one transactional boundary. Do not
split business state across sequential admin-client writes.
