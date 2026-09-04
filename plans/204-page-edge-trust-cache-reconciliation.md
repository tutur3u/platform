# Plan 204: Page and Verify Edge Trust-Cache Reconciliation

> **Executor instructions:** Reconcile every elevated trust subject through a
> stable database cursor and a strict bounded Redis write seam. Never report a
> successful cron run from a truncated or partially written feed.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/infrastructure/src/app/api/cron/infrastructure/sync-trust-cache' apps/infrastructure/src/lib/infrastructure/cron-monitoring.test.ts packages/utils/src/abuse-protection/edge-trust.ts packages/utils/src/abuse-protection/__tests__/edge-trust.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness / cache reconciliation
- **Depends on:** Plans 154 and 163; cron/frontend handoff plus database/type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The ten-minute cron materializes one unpaged RPC response. PostgREST can cap it
at 1,000 rows, silently omitting later elevated/absolute/unlimited subjects;
their cache entries expire and edge enforcement falls back to neutral. The
route also cannot detect individual Redis write failures because the generic
single-entry helper deliberately swallows errors.

## Exact contract

- Replace the RPC with
  `list_trusted_subjects_for_cache(p_min_multiplier numeric default 1.01,
  p_after_subject_key text default null, p_limit int default 500)`; clamp
  `p_limit` to `1..500`, filter `subject_key > p_after_subject_key`, and retain
  the existing deterministic `subject_key` precedence/result fields.
- The cron fetches pages until a short page. Each next cursor is the last
  non-null subject key; a missing/non-increasing cursor is a stable 500.
- Set an explicit 100-page/50,000-row safety ceiling. Reaching a full final
  page at that ceiling returns 503 `TRUST_RECONCILIATION_LIMIT_EXCEEDED` and
  logs counts; it must not report success.
- Add a reconciliation-only strict batch helper in `edge-trust.ts`. It reuses
  the existing key/serialization logic, uses an SDK pipeline if the installed
  client supports it or bounded `Promise.all` otherwise, and throws/returns a
  failed count rather than swallowing errors. Preserve the existing fail-open
  single-entry API for request-path callers.
- Success returns `{ok:true,pages,fetched,written,skipped}` only when every page
  fetched and every valid entry wrote. Any page/Redis failure returns a stable
  non-2xx sanitized envelope with the accumulated counts.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Resolve the active cron/frontend handoff that explicitly
owns this cron. Read Infrastructure/database instructions and inspect the
installed Upstash client before choosing pipeline versus bounded batch.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/infrastructure vitest run 'src/app/api/cron/infrastructure/sync-trust-cache/route.test.ts'` | paging, >1,000, ceiling, cursor, and partial-write cases pass |
| Cache helper | `bun --cwd packages/utils vitest run src/abuse-protection/__tests__/edge-trust.test.ts` | strict batch and preserved fail-open single-write cases pass |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/trust-cache-pagination.sql` | ordering/cursor/bounds/precedence cases pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | all pgTAP passes |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/trust-cache-pagination.sql` | focused DB and generated signature pass |
| Typechecks | `bun run --cwd apps/infrastructure type-check && bun run --cwd packages/utils type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** cursor-capable RPC migration/test/types; cron route and new
focused test; strict reconciliation batch helper and focused tests; existing
cron cadence characterization if required.

**Out of scope:** changing edge trust semantics, TTLs, rate-limit modes,
request-path fail-open behavior, cron cadence, deleting stale Redis keys,
production apply, or introducing a durable job system.

## Steps

1. Characterize the current precedence/result and create route tests with an
   injected paged RPC and strict writer. Include 1,001 subjects, exact 500-row
   boundaries, invalid cursor, page failure, Redis failure, and safety ceiling.
2. Add the bounded keyset RPC signature, retain service-role-only ACLs, and
   prove no duplicate/gap across override/reputation precedence in pgTAP.
3. Add the strict batch helper without weakening the existing request-path
   helper. Process each page under an explicit write concurrency/batch limit.
4. Loop pages in the cron, validate monotonic cursors, publish complete counts,
   and fail non-success on incomplete fetch/write.
5. Run focused/full/typegen database gates, focused tests, typechecks, build,
   repository, and whitespace checks.

## Done criteria

- [ ] More than 1,000 subjects reconcile without truncation or duplication.
- [ ] Incomplete page or Redis work cannot return `ok:true`.
- [ ] Memory and concurrent writes are bounded by the page/batch constants.
- [ ] Existing edge lookup and request-path fail-open behavior is unchanged.
- [ ] Database, tests, typechecks, build, repository, and whitespace pass.

## STOP conditions

Stop if Plan 154 is not green, ownership is unavailable, the installed Redis
client cannot support a strict bounded seam without breaking request-path APIs,
the precedence contract cannot be preserved, generated drift is unrelated, or
a mandatory gate fails twice.
