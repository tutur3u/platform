# Plan 094: Make Mail Thread Detail and State Changes Complete

> **Executor instructions:** Paginate thread detail separately from thread-wide
> state mutations. A successful thread action must affect every authorized
> message, not an arbitrary first 200.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/mail/src/lib/mail/repository/threads.ts apps/mail/src/lib/mail/repository packages/internal-api/src/mail.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on thread-detail/state or Mail ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness
- **Depends on:** Mail catch-all ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Thread detail silently returns only the earliest 200 messages. Mark-read,
star, archive, trash, and restore also select at most 200 unordered IDs and
report success after mutating only that subset.

## Current state

- `threads.ts:225-255` orders ascending and applies `.limit(200)` without a
  cursor or truncation marker.
- `threads.ts:268-318` selects at most 200 message IDs without ordering, then
  upserts state for only those IDs.
- `threads.ts:324+` returns the same capped detail after the partial mutation.
- No test covers a thread with more than 200 messages.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and coordination. This plan is
blocked by the active Mail catch-all handoff; obtain exact-path transfer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Migration | `bun sb:new complete_mail_thread_state` | one additive migration |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | >200-message state tests pass |
| Apply/typegen | `bun sb:up && bun sb:typegen` | exit 0 |
| Mail tests | `bun --cwd apps/mail vitest run src/lib/mail/repository/threads.test.ts` | detail/state suite passes |
| Mail build | `bun run --cwd apps/mail build` | exit 0 |
| Repository | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- `threads.ts`, extracted focused modules kept below 700 LOC, and tests
- one actor/mailbox/thread-bound set-based state RPC plus pgTAP tests
- internal API/detail caller types if cursor metadata is added
- generated DB types and README status

Do not change list pagination (Plan 093), ingestion, or what each action means.

## Git workflow

After transfer, use `fix/mail-thread-completeness` in an isolated worktree and
run `bun setup`. Commit `fix(mail): complete thread reads and state changes`.

## Steps

1. Characterize 201+ message detail ordering, newest-subject behavior, and all
   state operations, including retries and concurrent ingestion.
2. Add deterministic cursor pagination to detail and return explicit
   continuation metadata. Resolve thread summary/newest subject independently
   of the visible message page.
3. Implement each thread-wide action as one idempotent set-based database
   operation scoped by actor mailbox and thread. It must discover all matching
   messages in the transaction; never accept caller-supplied message IDs.
4. Prove all 201+ rows change, new concurrent rows follow a documented snapshot
   rule, and retries do not duplicate state. Run all gates.

## Done criteria

- [ ] Detail exposes every message through deterministic pagination.
- [ ] Thread-wide actions affect the complete authorized thread.
- [ ] Success responses cannot conceal partial state application.
- [ ] Database, focused tests, Mail build, and repository gates pass.

## STOP conditions

Stop until ownership transfers, if product policy requires message-page-only
actions, if concurrent-ingestion semantics are unresolved, or a gate fails twice.

## Maintenance notes

Never reuse a UI page limit as the mutation scope for a thread-wide action.
