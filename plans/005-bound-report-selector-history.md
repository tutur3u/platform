# Plan 005: Bound Report-Selector History Queries

> **Executor instructions:** Implement the fixed recent-history contract below;
> do not delegate the cap or group-filter decision. Stop on drift. The Contacts
> build is mandatory because this plan changes a Next page.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/contacts/src/app/'[locale]'/'[wsId]'/users/reports/'[reportId]'/page.tsx apps/contacts/src/app/'[locale]'/'[wsId]'/users/reports/'[reportId]'/page.test.tsx`
> Reconcile any changed query or selector contract before editing.

## Status

- **Execution status:** BLOCKED — Contacts report-view tests remain owned by
  `tmp/agent-coordination/20260727-143000-codex-daily-report-delivery.md`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** Performance / Contacts
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

Do not start while that note remains `handoff`. Its runtime work landed, but its
database release and production verification are still open and it claims the
same report-view test surface.

## Why this matters

The report detail page fetches all columns and the complete report history for a
user/workspace, then renders only `id` and `title` as selector options. History
grows without bound and the view contains large content/feedback/instruction
fields, increasing database work, server memory, serialization, and page latency.

## Current state

- `apps/contacts/src/app/[locale]/[wsId]/users/reports/[reportId]/page.tsx`
  calls `getReports` while rendering the detail page.
- `getReports` selects `*` from
  `private.external_user_monthly_reports_workspace_view`, filters user/workspace,
  orders descending, and has no `.limit` or `.range`.
- Although `getReports(wsId, groupId, userId, ...)` accepts `groupId`, the query
  at lines 325-330 never filters `group_id`. Its force-redirect can therefore
  select the newest report for the user from a different group.
- The selector maps those rows only to `{ label: report.title, value: report.id }`.
- `page.test.tsx` exists but does not assert the report-list query projection or
  bound.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-satellite-app-ux`,
`$tuturuuu-agent-coordination`, and `$supabase-postgres-best-practices` for query
shape review. Read the nearest Contacts `AGENTS.md` if present.

The required contract is the latest 100 reports for the exact
`(workspace, group, user)` tuple, ordered by `created_at DESC, id DESC`, with the
currently loaded deep-linked report merged into selector options if older.

## Exact scope

Allowed files:

- `apps/contacts/src/app/[locale]/[wsId]/users/reports/[reportId]/page.tsx`
- Its existing sibling `page.test.tsx`

In scope: selector projection, group correctness, fixed cap, deterministic
ordering, preservation of the current report, and focused tests.

Out of scope: changing report content loading, redesigning the report editor, or
adding a general report search service.

## Git workflow

- Branch: `perf/bound-report-selector-history` in an isolated worktree.
- Conventional Commit: `perf(contacts): bound report selector history`.
- Do not push/open a PR unless asked. Claim the commit window before staging or
  committing.

## Steps

1. **Freeze the contract.** Add a module constant `REPORT_SELECTOR_LIMIT = 100`.
   Preserve the existing recent-selector UI; do not add search/pagination.

   Verify: a focused test observes `.limit(100)` and no exact-count request.

2. **Project only selector fields.** Change the list query to select the minimum
   typed fields needed by the selector and redirect: `id`, `title`, and
   `created_at`. Remove `count: 'exact'`; return no unused total.

   Verify: the query-builder mock asserts the exact projection string and the
   return type contains only selector fields.

3. **Bind group and bound ordering.** Add `.eq('group_id', groupId)` alongside
   existing workspace/user filters, then order by `created_at` descending and
   `id` descending before `.limit(REPORT_SELECTOR_LIMIT)`.

   Verify: tests assert all three tenant/entity predicates, both order calls in
   order, and the limit. A user with reports in two groups redirects only within
   the selected group.

4. **Preserve deep links.** If the already loaded current report matches the
   selected workspace/group/user but falls outside the recent window, prepend
   its `{ id, title, created_at }` selector projection and deduplicate by ID. Do
   not add a second query. Never merge a report after the user/group filters have
   changed.

   Verify: tests cover old matching report merged once, recent report deduped,
   and mismatched group/user not merged.

5. **Add focused tests.** Assert the exact projection, workspace/user filters,
   descending order, secondary order if used, and limit. Cover empty history,
   recent current report, old current report merged into options, deduplication,
   `new`, and query failure behavior.

6. **Verify.** Run the focused test, then `bun check`,
   `bun --cwd apps/contacts run build`, and `git diff --check`; expected exit 0
   and no whitespace output.

## Commands you will need

```bash
bun --cwd apps/contacts vitest run \
  'src/app/[locale]/[wsId]/users/reports/[reportId]/page.test.tsx'
bun check
bun --cwd apps/contacts run build
git diff --check
```

## Test plan

Extend the existing exact `page.test.tsx`. Mock the Supabase builder to assert
projection, tenant filters, ordering, and limit; add cases for empty history,
recent current report, old current report, deduplication, `new`, and query error.

## Done criteria

- [ ] The selector query fetches only `id`, `title`, and `created_at`, is bounded
  to 100, and filters the exact workspace/group/user tuple.
- [ ] Current old-report deep links remain selectable and are not duplicated.
- [ ] Tests fail if projection, tenant filters, ordering, or the bound regresses.
- [ ] Focused tests, `bun check`, the Contacts build, and `git diff --check` pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if product evidence requires arbitrary full history in this control, the
view lacks `group_id`, the ordering cannot be supported, or current-report
merging requires changing shared Filter semantics.

## Maintenance notes

Reviewers should confirm the cap matches product expectations and old deep links
stay present. If full-history search is later required, add explicit server
pagination/search rather than removing the bound.
