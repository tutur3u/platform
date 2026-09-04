# Plan 147: Bound Bulk Student-Performance Reports

> **Executor instructions:** Prevent Teach from emailing incomplete learner
> performance data and move bulk delivery to a bounded, recoverable contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/teach/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/student-performance' apps/teach/src/app/api/cron/teach/student-performance-reports apps/teach/src/components/teach-operations/course-student-performance-panel.tsx apps/teach/messages apps/teach/vercel.json packages/internal-api/src/teach.ts packages/internal-api/src/teach.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / performance / test-coverage
- **Depends on:** canonical archival or exact-path transfer of the top-level
  education-extraction note; migration/generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The bulk route ignores query errors and reads complete enrollment/submission
tables through PostgREST, whose configured 1,000-row cap can silently truncate
ordinary course histories. It then renders and waits for every email in one
request. Learners can receive authoritative-looking but incomplete reports, and
partial delivery has no durable recovery record.

## Current state

- The route fetches members, modules, submissions, and user links without
  pagination and does not inspect any query error.
- `apps/database/supabase/config.toml` caps PostgREST at 1,000 rows.
- The UI directly awaits the bulk endpoint and reports its returned sent count.
- Both bulk and single send currently require only `view_user_groups`; the
  executor must settle the intended send capability before broadening access.
- No route test covers authorization, truncation, query failure, or partial
  email failure.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Teach's nearest policy. Do not begin until the malformed
top-level education note is archived or exact paths transfer, and database/
generated-type owners release their paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route/UI | `bun --cwd apps/teach vitest run 'src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/student-performance/send-bulk-report/route.test.ts' src/components/teach-operations/course-student-performance-panel.test.tsx` | bounded job contract passes |
| Worker | `bun --cwd apps/teach vitest run src/app/api/cron/teach/student-performance-reports/route.test.ts` | cron auth, claims, retry, and settlement pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/teach.test.ts` | typed start/status contract passes |
| Focused DB | `bun --cwd apps/database scripts/run-supabase.js test db supabase/tests/teach-student-performance-report-jobs.sql` | aggregate/job/idempotency cases pass |
| Full DB | `bun --cwd apps/database scripts/run-supabase.js test db` | all pass |
| Apply/typegen | `bun sb:up && bun sb:typegen` | intended job/RPC types only |
| Typechecks | `bun run --cwd apps/teach type-check && bun run --cwd packages/internal-api type-check` | both pass |
| Build | `bun run --cwd apps/teach build` | production build passes |
| Repository | `bun check` | exit 0 |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | bilingual keys are sorted and valid |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** bulk route and new tests; performance panel status UI/test; typed
internal-api start/status facade/test; exact Teach cron worker route/test and
`vercel.json` schedule; one aggregate/job migration and pgTAP; generated types;
Teach English/Vietnamese messages if the status UI needs new copy.

**Out of scope:** changing grading formulas, single-report copy/localization,
automatic schedules, external queue vendors, or unrelated Teach reporting.

## Git workflow

After transfer use `fix/bound-student-performance-reports` and commit
`fix(teach): bound student performance reports`. Do not push or apply production
migrations.

## Steps

1. Characterize current statistics and replace `view_user_groups` on this bulk
   mutation with the existing `send_user_group_report_emails` capability. Keep
   the single-recipient route out of this plan. Test cookie and Teach
   app-session actors and deny before aggregate/job creation.
2. Add one service-role-only workspace/course-scoped aggregate RPC that returns
   a complete per-recipient snapshot (recipient identity, module/quiz totals,
   completion and score fields needed by the existing template). It must use
   set-based SQL, fail closed, and be proven against more than 1,000 submission
   rows. Revoke PUBLIC/anon/authenticated execution and set a safe search path.
3. Add private job and recipient tables. The start transaction takes
   `Idempotency-Key`, actor, workspace, and course; validates the course belongs
   to the workspace; materializes the complete aggregate result into immutable
   per-recipient snapshot JSON; and returns exactly
   `202 { jobId, status: 'queued' }`. The same key/same scope returns the same
   job; key reuse across a different actor/workspace/course is a non-disclosing
   409. GET on the same route requires the same workspace permission and returns
   `{ jobId, status, total, queued, processing, sent, failed, uncertain }`.
4. Add exact worker `GET /api/cron/teach/student-performance-reports`, guarded
   by `Authorization: Bearer ${CRON_SECRET}` and wrapped with Teach's cron log
   drain. Register `0/5 * * * *` in `apps/teach/vercel.json`. One invocation
   claims at most 25 recipients with `FOR UPDATE SKIP LOCKED`, a ten-minute
   lease, and attempt metadata. Immediately before the provider call, persist a
   `dispatch_started_at` marker in a separate committed claim transition; then
   render only the stored snapshot and settle each
   row sent/retryable/failed; and returns `{ claimed, sent, failed, uncertain,
   remaining }`. A definitive pre-acceptance provider failure increments
   `attempt_count` and schedules `next_attempt_at` after 1, 5, then 30 minutes;
   after four total attempts the row becomes terminal `failed` and participates
   in job finalization. The current provider contract has no idempotency key, so do not claim
   exactly-once delivery: a lease that expires after dispatch started but before
   durable settlement becomes `delivery_uncertain` and is never automatically
   resent. Only rows whose provider call definitively failed before acceptance
   may be retried automatically. Store provider/audit ids when available for
   reconciliation. Add worker tests for missing/mismatched secret, concurrent
   claims, definitive provider failure, expired pre-dispatch lease, expired
   post-dispatch lease becoming uncertain, no automatic uncertain resend, and
   job finalization.
5. Add typed start/status helpers including the `uncertain` count and update the
   panel to show queued/progress/completed/partial-failure/uncertain-delivery
   states. Focused internal-api/UI tests must prove the uncertain count is not
   dropped and produces an explicit reconciliation warning. Add all new copy to
   both Teach bundles and run `bun i18n:sort`, `bun i18n:key-parity`, and
   `bun i18n:namespace-check`.
6. Run database, route, worker, internal-api, UI, typecheck/build, repository,
   i18n, and whitespace gates.

## Done criteria

- [ ] No report is sent from incomplete or failed source queries.
- [ ] Courses above 1,000 submissions retain exact statistics and recipients.
- [ ] Bulk delivery is bounded and observable; definitive failures are resumable without silently replaying uncertain sends.
- [ ] Ambiguous provider outcomes are visible and never automatically resent.
- [ ] Definitive failures use 1/5/30-minute backoff with four total attempts, then finalize.
- [ ] The send permission is explicit and tested for cookie/app-session actors.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on ownership, inability to add the exact CRON_SECRET-protected Teach worker
and schedule above, permission-contract drift, inability to snapshot all
recipients atomically, broad typegen drift, or the same gate failing twice.
