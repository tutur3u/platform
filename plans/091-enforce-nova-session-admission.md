# Plan 091: Enforce Nova Session Admission Atomically

> **Executor instructions:** Make challenge admission a server-owned atomic
> transition. Do not trust client times, status, attempt counts, whitelist
> decisions, or a generic password cookie.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/nova/src/app/api/v1/sessions apps/nova/src/app/api/v1/schemas.ts 'apps/nova/src/app/[locale]/(dashboard)/challenges' apps/nova/src/app/api/auth/challenges/verify-password apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on session, admission, password-proof, or database ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / correctness
- **Depends on:** Plan 014; generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Session POST currently persists caller-selected timing/status for any challenge
without checking availability, whitelist, password, or attempt limits. A user
can bypass every competition-admission rule enforced only by the browser and
corrupt attempt, duration, and leaderboard integrity.

## Current state

- `apps/nova/src/app/api/v1/sessions/route.ts:50-94` authenticates a Nova actor,
  parses the body, and inserts directly through the private admin client.
- `apps/nova/src/app/api/v1/schemas.ts:42-47` accepts arbitrary string status,
  caller start/end times, and a challenge ID.
- `challengeCard.tsx:74-104,294-340` computes enabled/window and total/daily
  attempt limits only in UI state.
- `confirmDialog.tsx:63-113` separately verifies a password, then submits
  client time and `IN_PROGRESS`.
- `verify-password/route.ts:69+` issues a generic verifier cookie; session POST
  does not bind or consume it for the actor and challenge.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Complete Plan 014 first so collection/detail
authorization has one actor model. This plan is blocked while active Mail,
Inventory, Zalo, or other coordination notes own generated database types;
obtain exact transfer before creating the migration with `bun sb:new`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new enforce_nova_session_admission` | one additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | admission pgTAP suite passes |
| Local apply | `bun sb:up` | migration applies locally |
| Type generation | `bun sb:typegen` | generated types reflect the RPC only |
| Nova routes | `bun --cwd apps/nova vitest run src/app/api/v1/sessions/route.test.ts src/app/api/auth/challenges/verify-password/route.test.ts` | admission matrix passes |
| Nova build | `bun run --cwd apps/nova build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Nova session collection POST/schema/tests
- password-verification route and participant challenge caller/tests
- one server-only admission service
- one additive private-schema RPC migration, pgTAP test, and generated DB types
- `plans/README.md` only for status

Do not alter grading, submission authorization, leaderboard formulas, manager
role mutation, or existing sessions.

## Git workflow

Use branch `fix/nova-session-admission` in an isolated worktree and run
`bun setup`. Commit `fix(nova): enforce atomic challenge admission`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Define the authoritative admission contract

Document and test that the server assigns `start_time = now()`, `end_time =
null`, and the sole initial status `IN_PROGRESS`. Admission requires enabled,
whitelist membership when configured, `open_at <= now < close_at` when set,
and total/daily attempt counts below their limits. Define the daily boundary in
UTC; stop if product policy requires another timezone.

### Step 2: Bind password proof

Replace the generic proof with a short-lived, single-use proof bound to actor
ID and challenge ID. Store only opaque/signed proof material client-side; never
return or log password hashes, salts, or verifier values. No-password
challenges require no proof.

### Step 3: Create one atomic admission RPC

Create a private `SECURITY DEFINER` function with a fixed search path and revoke
execution from `PUBLIC`, `anon`, and `authenticated`; only the service-role
server path may invoke it. The Nova route resolves the app-session actor and
passes that trusted actor ID explicitly because the admin database connection
cannot derive the app-session identity. Add privilege tests proving ordinary
database callers cannot invoke or spoof the actor. Lock the actor/challenge
admission key and re-evaluate every rule in the transaction. Add a
caller-generated idempotency UUID with a unique actor/challenge/request
invariant. Resolve and return an existing idempotent session before checking or
consuming a single-use password proof; only a genuinely new request consumes
the proof, counts attempts, and inserts one session.

### Step 4: Narrow the HTTP contract

POST accepts only `challengeId`, `admissionRequestId`, and optional opaque
password proof. Reject unknown fields. Map ineligible/password/limit failures
to stable non-secret 403/409 envelopes, validation to 400, anonymous to 401,
and successful creation/retry to the existing session envelope.

### Step 5: Prove concurrency and rollout

Use pgTAP plus a real two-connection test where feasible to prove concurrent
requests cannot exceed attempt limits and idempotent retries create one row.
Cover open/close edges, whitelist, disabled, password, total/daily limit, and
manager behavior. Apply locally, regenerate types, and run all gates.

## Done criteria

- [ ] Session creation enforces every challenge-admission rule server-side.
- [ ] Client time/status and arbitrary fields are rejected.
- [ ] Password proof is actor/challenge-bound, short-lived, and single-use.
- [ ] Concurrent requests cannot exceed limits; retries are idempotent.
- [ ] Database tests/apply/typegen, Nova tests/build, and `bun check` pass.

## STOP conditions

Stop until Plan 014 and generated-type ownership clear. Also stop if
daily-boundary policy is not UTC, password
proof cannot be bound without a broader auth redesign, production duplicate
data violates a new uniqueness invariant, exact migration ownership appears,
or a gate fails twice.

## Maintenance notes

All future session-entry surfaces must call the same transaction; browser
availability checks are advisory UX only.
