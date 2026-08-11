# Plan 165: Cursor-Page Contacts Report Snapshot History

> **Executor instructions:** Replace the silently truncated all-history report
> log response with the exact cursor contract below, while resolving the latest
> approved restoration snapshot independently of the visible page.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'packages/users-core/src/routes/users/reports/[reportId]/logs' packages/internal-api/src/users.ts packages/internal-api/src/users.test.ts 'apps/contacts/src/app/[locale]/[wsId]/users/reports/[reportId]' apps/contacts/messages/en.json apps/contacts/messages/vi.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** daily-report delivery handoff transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The report editor currently downloads up to PostgREST's silent 1,000-row cap of
large snapshots, then scans that truncated array for the latest approved
version. A rejected report with more than 1,000 later edits can therefore lose
its authoritative restoration base while every page load transfers full
content, scores, feedback, and identity joins for the entire capped history.

## Current state

- `packages/users-core/src/routes/users/reports/[reportId]/logs/route.ts:21-36`
  selects `*`, orders only by `created_at DESC`, and has no limit or cursor.
- The private view in migration `20260531200539` projects `logs.*` plus user,
  group, and creator identity. Generated types show content, feedback, scores,
  rejection fields, and emails in every row.
- Local PostgREST is capped at 1,000 rows in
  `apps/database/supabase/config.toml`.
- `use-report-history.ts:48-68` raw-fetches the whole response and uses
  `Array.find` for the latest approved snapshot. `report-history.tsx` renders
  the full array and labels its length as history.
- Plan 005 bounds only the separate report selector and explicitly leaves
  report content/history loading out of scope.

## Exact contract

- Request: `GET .../logs?limit=<1..100>&cursor=<opaque>`; default 25, maximum
  100. Unknown query keys are ignored as today; malformed limit/cursor is 400.
- Cursor: opaque base64url JSON owned by users-core containing `created_at`
  plus `id`. The underlying log table declares both columns `NOT NULL`, but the
  generated view type conservatively marks them nullable. Both queries must add
  `.not('created_at', 'is', null)` and `.not('id', 'is', null)`, then validate
  every returned row with a runtime schema before cursor construction. A row
  that is still null/malformed after those predicates is a sanitized 500, not a
  skipped or synthetic cursor. Ordering is `created_at DESC, id DESC`; the next
  page is strictly after that tuple, with no offset pagination. Legacy null
  rows are excluded from both page and latest-approved selection; by the base
  table invariant none should exist, and the focused test freezes that fact.
- Response:
  `{ items: ReportHistoryItem[], nextCursor: string | null, latestApproved: ReportHistoryItem | null }`.
- `ReportHistoryItem` contains only `id`, `title`, `content`, `feedback`,
  `score`, `scores`, `report_approval_status`, `created_at`,
  `creator_full_name`, and `creator_display_name`. It contains no email,
  rejection actor/reason, group metadata, or unused IDs.
- `latestApproved` is the newest approved snapshot for the authorized
  `(workspace, report)` regardless of cursor/page. It must not be derived from
  `items`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-satellite-app-ux`,
`$vercel-react-best-practices`, `$supabase-postgres-best-practices`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact transfer
from `20260727-143000-codex-daily-report-delivery.md`; it claims the report-view
tests and users-core report helpers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd packages/users-core vitest run 'src/routes/users/reports/[reportId]/logs/route.test.ts'` | cursor, projection, access, and latest-approved cases pass |
| Client helper | `bun --cwd packages/internal-api vitest run src/users.test.ts` | report-history helper cases pass |
| Contacts | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-history.test.tsx' 'src/app/[locale]/[wsId]/users/reports/[reportId]/components/report-history.test.tsx'` | paging/restoration UI cases pass |
| Typechecks | `bun run --cwd packages/users-core type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/contacts type-check` | exit 0 |
| Contacts build | `bun run --cwd apps/contacts build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the users-core report-log route plus new test; typed helper and
test in `packages/internal-api/src/users.ts`; `use-report-history.ts` plus a new
hook test; `report-history.tsx` plus a new component test; the owning preview
component only for type wiring; Contacts messages only if no existing common
load-more label is suitable.

**Out of scope:** schema/view changes, report mutation/approval semantics,
selector Plan 005, periodic reports, changing snapshot content, or loading all
pages automatically.

## Git workflow

Use branch `perf/cursor-report-snapshot-history` and commit
`perf(contacts): cursor-page report history`. Use an isolated worktree, run
`bun setup`, claim/release the commit window, and do not push.

## Steps

1. **Freeze the route contract.** Create the focused route test with default,
   maximum, malformed, empty, first-page, next-page, equal-timestamp tie-break,
   authorization, query-error, and over-1,000 fixture cases. Assert the exact
   projection and a separate latest-approved query.

   **Verify:** the focused suite fails on the current array response and
   unbounded query only.

2. **Implement bounded server pagination.** Add strict query parsing, opaque
   cursor encode/decode helpers, `limit + 1` fetching, explicit non-null
   predicates, runtime row validation, deterministic tuple ordering, and the
   exact response. Run the page query and independent
   latest-approved query through the same authorized workspace/report filter;
   fail the whole response on either query error.

   **Verify:** route tests pass, including an approved snapshot older than
   1,000 newer rows, generated nullable view types, explicit non-null query
   predicates, and a fail-closed malformed/null row fixture.

3. **Add the typed internal API helper.** Define the shared item/response types
   and URL/query encoding in `packages/internal-api/src/users.ts`; add exact URL,
   cursor, default, and non-2xx tests. The client hook must use this helper, not
   raw `fetch`.

   **Verify:** the internal-api focused suite passes.

4. **Page the UI on demand.** Convert the hook to `useInfiniteQuery`, flatten
   and deduplicate pages by snapshot ID, take `latestApproved` from the server
   response, and expose `hasNextPage`/`fetchNextPage`/next-page loading. Do not
   automatically fetch every page. Keep selected snapshots stable when a page
   is appended.

   Update the history component to render a bounded initial list and an
   explicit Load more control using existing localized copy. Do not describe
   loaded length as the total corpus.

   **Verify:** hook/component tests cover first page, load more, duplicate
   boundary rows, no next page, page failure, selection retention, and rejected
   restoration from an older `latestApproved` outside `items`.

5. **Run all gates.** Run typechecks, Contacts build, `bun check`, and the
   whitespace command.

## Done criteria

- [ ] No report-log request materializes more than 101 page rows plus one
      latest-approved row.
- [ ] The response and internal helper use the exact typed cursor contract.
- [ ] Latest-approved restoration is correct even after more than 1,000 newer
      snapshots.
- [ ] The UI loads additional history only on explicit demand and preserves
      selection/error state.
- [ ] Focused tests, typechecks, build, repository, and whitespace gates pass.

## STOP conditions

Stop on missing ownership transfer, drift that removes the underlying table's
`NOT NULL` invariants, duplicate cursor tuples, a supported caller requiring the
old raw-array shape, need for a schema migration, need to auto-load all pages,
or a gate failing twice.

## Maintenance notes

The latest-approved lookup is a correctness contract, not a pagination
convenience. Future projection changes must keep private identity fields out of
the list unless the UI demonstrably needs them.
