# Plan 093: Paginate Mail Thread Lists in the Database

> **Executor instructions:** Replace the fixed 5,000-message scan with a
> database-owned, deterministic thread page. Preserve every folder/search rule.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/mail/src/lib/mail/repository packages/internal-api/src/mail.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on Mail repository, schema, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance / correctness
- **Depends on:** Mail catch-all ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every Mail list page scans up to 5,000 full messages and state rows, derives
threads in memory, and only then returns 1–100 summaries. Large mailboxes pay
that cost repeatedly and silently lose totals and older threads beyond the cap.

## Current state

- `search.ts:106-119,175-224` forces a 5,000-row scan, exact count, full
  message selection, and large in-memory state filters.
- `threads.ts:78-140` builds participant/latest maps over the scan before
  slicing the requested thread page; `:147-193` hydrates the sliced results.
- `pagination.total` counts only unique threads found in the capped scan.
- `threads-unread.test.ts` tests only a pure unread counter.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. This is blocked by
`20260711-134432-codex-mail-catchall-ux.md`, which owns all exact Mail,
migration, internal API, generated-type, and lockfile paths. Obtain transfer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Migration | `bun sb:new paginate_mail_threads` | one additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | Mail paging pgTAP passes |
| Apply/typegen | `bun sb:up && bun sb:typegen` | migration applies and types refresh |
| Mail tests | `bun --cwd apps/mail vitest run src/lib/mail/repository/threads.test.ts` | folder/search/cursor suite passes |
| Internal API | `bun run --cwd packages/internal-api type-check` | exit 0 |
| Mail build | `bun run --cwd apps/mail build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- Mail thread-list/search repository and new focused tests
- one additive RPC migration and pgTAP suite
- Mail internal API types only if the cursor envelope changes
- generated database types and README status

Do not change message detail, thread-wide state mutations (Plan 094), mail
ingestion, retention, or user-visible folder semantics.

## Git workflow

After transfer, use `perf/mail-thread-pagination` in an isolated worktree, run
`bun setup`, and commit `perf(mail): paginate threads in database`. Claim the
commit window before staging.

## Steps

1. Characterize inbox, sent, drafts, archive, trash, starred, labels, search,
   unread aggregation, participant projection, and equal-timestamp ordering,
   including a mailbox with more than 5,000 messages.
2. Add one private, actor-bound query/RPC that applies those predicates,
   selects the latest message per thread, aggregates unread/participants, and
   returns at most the requested 1–100 summaries with a deterministic opaque
   cursor and `hasMore`. Define whether total is exact; do not fake it from a
   capped window.
3. Replace `threadScan` for list pages and hydrate only returned IDs. Preserve
   response fields or update the typed facade and callers together.
4. Prove later pages do not rescan earlier mailbox contents and execute all
   database, test, type, build, and repository gates.

## Done criteria

- [ ] Mailboxes over 5,000 messages expose complete deterministic pagination.
- [ ] Work per page is bounded by page size, not mailbox size.
- [ ] Every existing folder/search/state rule has parity coverage.
- [ ] Database/apply/typegen, focused tests, Mail build, and `bun check` pass.

## STOP conditions

Stop until Mail ownership transfers; also stop on ambiguous folder semantics,
unsupported search indexing, invalid historical rows, or two failed gates.

## Maintenance notes

Cursor fields and sort tie-breakers are public contracts. Change them only with
facade and caller parity tests.
