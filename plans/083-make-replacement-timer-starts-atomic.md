# Plan 083: Make Replacement Timer Starts Atomic

> **Executor instructions:** Replace every stop-then-start timer transition
> with one actor-bound transactional operation. Preserve response and duration
> semantics across Track, Web, Mira, and mobile.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/quick-start/route.ts' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/quick-start/route.ts' packages/ai/src/tools/executors/timer/timer-session-lifecycle.ts apps/mobile/lib/features/time_tracker/cubit/time_tracker_cubit.dart apps/database/supabase/migrations packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on timer state-machine, schema, generated-type, or route-ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** Correctness / transactional integrity
- **Depends on:** G22 migration artifacts and generated database type ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every replacement entry point stops the current timer before the new timer is
known to exist. Validation, trigger, network, or insert failure can therefore
terminate active work while returning an error, and concurrent starts can leave
inconsistent active-session state.

## Current state

- Track quick-start ignores the stop update result before inserting.
- The canonical Track sessions route closes and inserts in separate writes.
- Mira closes running sessions one by one before creating the replacement.
- Mobile explicitly sends a stop request followed by a start request.
- A changed legacy Web route requires first-class extraction and migration
  tracking; database types and those artifacts have active owners.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-mobile-task-board`, and `$tuturuuu-agent-coordination`. Read the
nearest app AGENTS files. Do not start until all exact owners release or
transfer their paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new replace_running_timer_atomically` | one additive migration is created |
| Apply locally | `bun sb:up` | migration applies without error |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | actor, rollback, idempotency, and concurrency cases pass |
| Track tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/quick-start/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.test.ts'` | both entry points map the RPC contract correctly |
| AI tests | `bun run --cwd packages/ai test -- src/tools/executors/timer/timer-session-lifecycle.test.ts` | Mira uses the same atomic transition |
| Type generation | `bun sb:typegen` | generated types reflect the RPC |
| Mobile generation/analysis | `cd apps/mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze` | generated clients and analysis pass |
| Mobile tests | `cd apps/mobile && flutter test test/features/time_tracker` | single-transition behavior passes |
| App builds | `bun run --cwd apps/track build && bun run --cwd apps/web build` | both apps compile |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- one additive database migration and focused pgTAP test
- generated database types only after local apply
- the Track quick-start and sessions routes plus focused tests
- the Web legacy quick-start handler, its collision-safe first-class route/test
  replacement, and exact migration override/manifest keys
- `packages/ai/src/tools/executors/timer/timer-session-lifecycle.ts` and test
- the mobile time-tracker cubit, generated client only if required, and focused tests
- `plans/README.md` only for status

Do not redesign timer UI, break types, history, goals, or elapsed-time display.

## Git workflow

Use branch `fix/atomic-replacement-timer-start` in an isolated worktree and run
`bun setup`. Commit `fix(track): make replacement timer starts atomic`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Freeze the transition contract

Characterize duration calculation, task/category containment, no-current-timer,
replacement success, insert failure, duplicate/retried request, concurrent
starts, and all current response envelopes.

### Step 2: Add one actor-bound RPC

Create a private or tightly granted function that derives the actor from
`auth.uid()` or a trusted service-role wrapper, validates all workspace/task/
category inputs before writes, closes existing active sessions, inserts exactly
one replacement, and returns the closed/new session data in one transaction.
Use an explicit request idempotency key and a database uniqueness invariant.

### Step 3: Route every server entry point through it

Track quick-start, Track sessions, and Mira must call the same operation. Remove
ignored stop results and per-session close loops. Preserve app-session actor
resolution by passing a verified actor only through the trusted wrapper.

### Step 4: Make mobile issue one transition

Replace the client-composed stop/start pair with the single server start
operation. Preserve optimistic/loading/error behavior, but never report the old
timer stopped unless the atomic replacement committed.

### Step 5: Move the Web route correctly and verify

Collision-safely remove the generated first-class wrapper, `git mv` the legacy
handler/test into the vacant first-class path, re-key the exact override, and
regenerate the manifest. Run database, server, mobile, build, and repository
gates.

## Done criteria

- [ ] Replacement validation and insertion succeed or prior timers remain unchanged.
- [ ] Concurrent/retried starts yield one deterministic active replacement.
- [ ] Track, Web, Mira, and mobile use one transition contract.
- [ ] Migration, typegen, route tracking, builds, focused tests, `bun check`, and whitespace pass.

## STOP conditions

Stop if ownership remains active, actor binding cannot be proven, production
duplicates prevent the uniqueness invariant, the mobile client cannot use the
single transition without a contract decision, or a required gate fails twice.

## Maintenance notes

Starting a timer is a state transition, not two best-effort CRUD calls.
