# Plan 059: Make Calendar Reset Atomic

> **Executor instructions:** Make workspace Calendar reset all-or-nothing and
> report success only for a fully committed reset.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendars/reset/route.ts' packages/internal-api/src/calendar.ts packages/internal-api/src/calendar.test.ts packages/sdk/src/platform-calendar.ts packages/sdk/src/platform-calendar.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop if reset scope, calendar schemas, or caller contracts changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Correctness / Destructive operation integrity
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo lanes retain generated database
type ownership. The reset RPC must regenerate
`packages/types/src/supabase.ts`; do not edit through those owners.

## Why this matters

Reset deactivates tokens, deletes connections, deletes events, and removes
custom calendars in four independent operations. Every failure is logged and
ignored, after which the endpoint returns `success: true`; callers can believe
a reset completed while the workspace is left in a partially disconnected and
internally inconsistent state.

## Current state

- `calendars/reset/route.ts:48-112` performs four sequential admin writes across
  public and private tables and records counts independently.
- Token, connection, event, and custom-calendar errors do not abort the flow.
- This plan guarantees atomicity among the reset's four database mutations. It
  does not claim to quiesce an already-running provider sync; that requires a
  shared sync/reset generation or claim protocol outside this focused fix.
- The route already authenticates the Calendar app session, normalizes the
  workspace, and requires `manage_workspace_settings`.
- `packages/internal-api/src/calendar.ts` and `packages/sdk/src/platform-calendar.ts`
  expose the reset response, so count and failure semantics must remain typed.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`.
Inspect foreign-key/cascade behavior for all four tables and confirm exactly
which system calendars must survive.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendars/reset/route.test.ts'` | permission/result cases pass |
| Client tests | `bun run --cwd packages/internal-api test -- src/calendar.test.ts && bun run --cwd packages/sdk test -- src/platform-calendar.test.ts` | reset contract passes |
| Database apply | `bun sb:reset` | reset migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | transaction/rollback cases pass |
| Database types | `bun sb:typegen` | generated RPC types are current |
| Calendar typecheck | `bun run --cwd apps/calendar type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Calendar reset route and new colocated test
- One private reset RPC, additive migration,
  `apps/database/supabase/tests/calendar-workspace-reset.sql`, and generated types
- Internal API/SDK reset callers and focused tests, including a new
  `packages/sdk/src/platform-calendar.test.ts`; keep the existing public success
  response type and field names unchanged

Do not change OAuth initiation, provider revocation, external-provider data,
system calendar definitions, or general calendar deletion endpoints.

## Git workflow

- Branch: `fix/atomic-calendar-reset` in an isolated worktree; run `bun setup`
  immediately.
- Conventional Commit: `fix(calendar): make workspace reset atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Characterize reset invariants

List the rows that must be deactivated/deleted and the system calendars that
must survive. Verify cascades do not delete retained system calendars or leave
connections referencing removed rows. Preserve the existing count field names.

### Step 2: Add a server-only transaction

Create one private security-definer function that validates actor, workspace,
and `manage_workspace_settings`, then performs all four mutations in a single
transaction and returns their committed counts. Revoke execute from `PUBLIC`,
`anon`, and `authenticated`; fully qualify schemas and set a safe search path.

### Step 3: Replace fail-open orchestration

Call the RPC after route authentication. Map typed permission/not-found/database
failures without returning partial counts or success. Remove per-table catch-and-
continue behavior. Keep SDK/internal API response compatibility for success.

## Test plan

pgTAP must cover success counts, system-calendar preservation, injected failure
at each stage with complete rollback, unauthorized actor, foreign workspace,
and concurrent reset calls. It does not simulate provider sync concurrency.
Route tests cover anonymous/nonmember/no-permission,
success, typed RPC failure, and proof that no direct table mutation remains.

## Done criteria

- [ ] Reset commits all four state changes or none.
- [ ] Success is returned only after a complete transaction.
- [ ] System calendars survive and counts reflect committed rows.
- [ ] The RPC independently validates actor/workspace/permission and is server-only.
- [ ] Route/client/database tests, reset/typegen, typecheck, repository gate, build, and whitespace pass.

## STOP conditions

Stop if reset must revoke credentials at Google/Microsoft as part of the same
user promise (external calls cannot share the database transaction), if current
foreign keys make the intended survivor set ambiguous, or if clients rely on
partial-success counts. Also stop and expand this into a coordinated sync/reset
generation protocol if product requirements define success as preventing every
already-running provider sync from writing after reset commits.

## Maintenance notes

Destructive multi-table operations must expose one transactional result. If
provider revocation is added later, model it as a durable post-commit workflow
with explicit status rather than pretending it is database-atomic. A follow-up
should serialize provider persistence against reset with a workspace generation
or claim before promising a quiescent post-reset state.
