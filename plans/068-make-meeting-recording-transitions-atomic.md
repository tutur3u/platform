# Plan 068: Make Meeting Recording Transitions Atomic

> **Executor instructions:** Replace the retry-unsafe check-then-toggle recording
> mutation with explicit, idempotent start/stop commands backed by one
> serialized database transition and a one-active-session invariant.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/meetings/[meetingId]/record/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/record/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/record/route.test.ts' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions.test.tsx' packages/internal-api/src/meetings.ts packages/internal-api/src/meetings.test.ts packages/internal-api/src/index.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on recording command, schema, generated-type, or migration-artifact drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** Correctness / Concurrency
- **Depends on:** Plan 066; G22 route/migration artifacts ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The current POST means “toggle”: it reads for an active session, then either
inserts or updates in a separate statement. Concurrent starts can create
multiple active sessions, a transient read error is mistaken for “none,” and a
retried successful request can immediately perform the opposite action. The
recording control therefore lacks a safe concurrency and retry contract.

## Current state

- `record/route.ts:60-102` ignores the active-session query error and performs
  a separate insert or update after the check.
- `20250811074420_add_meeting_recordings.sql:14-67` gives sessions only a primary
  key; no partial uniqueness invariant limits a meeting to one `recording` row.
- `packages/internal-api/src/meetings.ts:85-97` exposes the non-idempotent
  `toggleWorkspaceMeetingRecording` POST with no command body.
- `meeting-actions.tsx:63-105` uses that same toggle for both buttons; a start
  response may unexpectedly say stopped, and a stop retry can start a session.
- The exact `/record` mutation has no Rust owner. Its generated wrapper already
  occupies the first-class Web destination, so substantial rework must replace
  that wrapper, move the legacy handler, and re-key migration metadata.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Execute only after Plan 066 establishes the
workspace/meeting containment pattern and the G22 owner releases or transfers
the generated route artifacts. Audit for multiple `status = 'recording'` rows
per meeting before applying the invariant; any result is an operator STOP.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new atomic_meeting_recording_transitions` | one timestamped additive migration is created |
| Duplicate audit | `SELECT meeting_id, count(*) FROM public.recording_sessions WHERE status = 'recording' GROUP BY meeting_id HAVING count(*) > 1;` | zero rows locally and in the operator's production read-only preflight |
| Database apply | `bun sb:up` | migration applies to the local stack |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | serialization, idempotency, privileges, and rollback pass |
| Route test | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/record/route.test.ts'` | explicit start/stop contract passes |
| Internal API test | `bun run --cwd packages/internal-api test -- src/meetings.test.ts` | typed command payloads and responses pass |
| Meet test | `bun run --cwd apps/meet test -- 'src/app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions.test.tsx'` | buttons issue stable explicit commands |
| Type generation | `bun sb:typegen` | generated DB types include the new private RPC |
| Wrapper guard | `bun web:api-routes:check` | moved route needs no generated legacy wrapper |
| Migration metadata | `bun migration:tanstack:manifest && bun migration:tanstack:check` | first-class source key is current |
| Backend method guard | `bun check:backend` | POST remains tracked fallthrough, not falsely Rust-owned |
| Typechecks | `bun run --cwd packages/internal-api type-check && bun run --cwd apps/meet type-check && bun run --cwd apps/web type-check` | all exit 0 |
| Repository gate | `bun check` | exit 0 |
| App builds | `bun run --cwd apps/meet build && bun run --cwd apps/web build` | both production builds succeed |
| Whitespace | `git diff --check` | no output |

## Scope

- Replace the generated wrapper with the moved first-class Web `/record`
  handler and a new colocated route test; remove the legacy implementation
- `apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions.tsx`
  and a new focused component test
- `packages/internal-api/src/meetings.ts`, `src/index.ts`, and new
  `src/meetings.test.ts`
- One additive migration, focused pgTAP recording-transition test, and generated
  `packages/types/src/supabase.ts`
- This route's key only in `route-overrides.json`, then regenerated manifest

Do not change transcript/upload/playback behavior, add a Rust mutation handler,
silently repair production duplicates, or redesign recording ownership beyond
the existing authorized workspace-member contract.

## Git workflow

- Branch: `fix/atomic-meeting-recording-transitions` in an isolated worktree;
  run `bun setup` immediately.
- Conventional Commit: `fix(meet): make recording transitions atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Move and define the command route

After Plan 066, remove the generated first-class wrapper with scoped `git rm`,
then `git mv` the legacy `/record` handler into the vacant first-class tree and
create its new colocated test there. Accept exactly `{ action: 'start' }` or
`{ action: 'stop', sessionId: <uuid> }`; reject missing, toggle-style, unknown,
or mismatched payloads with 400. Preserve 401/403/404 tenant denials.

Start returns `{ success: true, action: 'started', sessionId }`; repeated or
concurrent starts return the same active session. Stop returns
`{ success: true, action: 'stopped', sessionId }`; repeated stops for that
session return the same terminal command result without creating another row.

### Step 2: Add one serialized transition primitive

Create a private, security-definer RPC callable only by `service_role`. It must
validate the supplied workspace/meeting relationship, lock the meeting row,
and execute each desired-state transition atomically. Start returns the current
active row or inserts one for the authenticated actor. Stop locks and validates
the supplied session under that meeting and transitions `recording` to
`pending_transcription`; an already non-recording target is an idempotent
success, while a missing/mismatched target is not found.

Add a partial unique index on `recording_sessions(meeting_id) WHERE status =
'recording'` as a backstop. Begin the migration with the same grouped duplicate
assertion and raise a descriptive exception before DDL when any row is found;
do not delete, merge, or transition historical sessions automatically. Revoke
RPC execution from `PUBLIC`, `anon`, and `authenticated`; explicitly grant only
`service_role`. The route authenticates and authorizes first, then passes its
server-derived actor ID to the RPC.

### Step 3: Migrate callers to explicit desired state

Replace the toggle helper with typed `startWorkspaceMeetingRecording` and
`stopWorkspaceMeetingRecording`. The stop helper requires the active session
ID. Update `MeetingActions` so each button calls only its named command and a
retry reuses the same action/session intent; an unexpected opposite action is
no longer a valid response branch. Preserve query-cache updates and existing UI
copy.

### Step 4: Prove database concurrency, failure, and route behavior

Use pgTAP plus two independent `extensions.dblink` connections to issue
simultaneous starts for one meeting: both calls must resolve the same session
and exactly one active row must exist. Create uniquely named synthetic auth,
workspace, membership, and meeting fixtures through a dedicated dblink setup
connection so they commit and are visible to both workers. Synchronize with
`dblink_send_query` on both worker connections before collecting either result.
Delete every committed fixture through a cleanup connection in both normal and
exception paths; fail the suite if cleanup leaves a matching synthetic ID.
Cover concurrent/repeated stop, different meetings, invalid workspace/session
containment, privilege revocation, and rollback on injected failure.
Route/component tests cover command validation, auth, RPC failure, returned
IDs, and exact caller intent.

## Test plan

Vitest proves HTTP, client, and UI mapping. The database suite—not a transaction
mock—proves serialization and uniqueness with real concurrent connections.
Ordinary pgTAP fixtures roll back; the dblink concurrency block uses committed,
unique synthetic fixtures with exception-safe explicit cleanup because separate
connections cannot observe the caller transaction.

## Done criteria

- [ ] Start and stop are explicit desired-state commands, never toggles.
- [ ] Concurrent/repeated starts yield one active session; repeated stops cannot restart recording.
- [ ] The private RPC validates containment, serializes per meeting, and is service-role-only.
- [ ] The partial unique index applies only after a zero-duplicate audit.
- [ ] The migration itself fails before DDL on duplicates, and the execution
      handoff records the same read-only zero-row production preflight as an
      operator gate before application.
- [ ] Web/Internal API/Meet tests, pgTAP, typegen, migration/wrapper/backend guards, typechecks, `bun check`, builds, and whitespace pass.
- [ ] The route is first-class and only its migration key/artifact is refreshed.

## STOP conditions

Stop if Plan 066 or G22 ownership is unresolved, any historical meeting has
multiple active sessions without operator disposition, `dblink` cannot run in
the documented local database harness, a Rust handler acquires POST, or product
requirements demand a different recording-ownership policy.

## Maintenance notes

Future recording controls must express desired state. Do not reintroduce a
toggle endpoint; retry safety depends on start and stop remaining independently
idempotent.
