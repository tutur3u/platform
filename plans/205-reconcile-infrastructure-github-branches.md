# Plan 205: Reconcile Infrastructure GitHub Branches Completely

> **Executor instructions:** Fetch the complete bounded GitHub branch snapshot,
> then replace persisted branch state set-wise in one short transaction. Never
> delete stale rows after a partial provider response.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/infrastructure/src/lib/infrastructure/projects.ts apps/infrastructure/src/lib/infrastructure/project-github-sync.ts apps/infrastructure/src/lib/infrastructure/project-github-sync.test.ts apps/infrastructure/src/lib/infrastructure/projects.test.ts 'apps/infrastructure/src/app/api/v1/infrastructure/projects/[projectId]/sync' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness / provider reconciliation
- **Depends on:** retained worktree needs a reviewed continuation after the
  mandatory Infrastructure typecheck failed twice
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The current sync reads only GitHub's first 100 branches, writes each branch in
its own awaited statement, and never removes deleted/renamed branches. Large
repositories therefore persist an incomplete and increasingly stale branch
inventory while a request holds a database transaction across serial queries.

## Retained implementation status

Execution stopped without a commit in
`.worktrees/perf-infrastructure-github-branches` on branch
`perf/infrastructure-github-branches`. The worktree is still based on exact
`60e33aebd9` and retains four scoped files: `projects.ts`, the new
`project-github-sync.ts` and test, and a new sync-route test. Focused Vitest
passes 3 files/16 tests; the source-size gate passes at 607/420 lines; and
`git diff --check` passes. Infrastructure typecheck failed twice: the first
failure exposed a moved `normalizeBranch` helper and was corrected; the second
is a test-only `it.each` union inference error at
`project-github-sync.test.ts:164`. Per the plan STOP rule, build, `bun check`,
and commit were not attempted. Continuation must review the retained diff,
correct only that typed test matrix, then rerun every mandatory gate from the
focused suite onward; do not assume the implementation is approved merely
because focused runtime tests pass.

## Exact contract

- Fetch fixed GitHub API URLs with `per_page=100&page=N`; never follow an
  arbitrary Link URL. Stop on a short page. Deduplicate by exact branch name and
  reject a duplicate name with conflicting SHA/protection metadata.
- Use a 100-page/10,000-branch safety ceiling. If page 100 is full, return a
  sanitized provider-limit failure and perform zero project/branch writes.
- A non-2xx, invalid JSON/shape, timeout, or any failed page performs zero
  persistence. Preserve the existing public/private repository checks and
  selected-commit fallback.
- After the full snapshot succeeds, use one transaction: update the project;
  bulk upsert all fetched branches in one set-based statement; delete rows for
  that project whose names are absent from the fetched snapshot. Empty snapshot
  is authoritative and deletes all persisted branches only after a successful
  page-one response.
- Preserve `InfrastructureProject` response fields/order. `last_synced_at` and
  project `latest_synced_at` advance only on a committed full reconciliation.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Infrastructure instructions. Prove no active note owns
the exact live Infrastructure project file/route/test; the historical Web
Infrastructure note is terminal and does not own this path. Create an isolated
worktree and run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `bun --cwd apps/infrastructure vitest run src/lib/infrastructure/project-github-sync.test.ts src/lib/infrastructure/projects.test.ts 'src/app/api/v1/infrastructure/projects/[projectId]/sync/route.test.ts'` | paging/reconciliation/failure/route cases pass; create route test if absent |
| Source size | `test "$(wc -l < apps/infrastructure/src/lib/infrastructure/projects.ts)" -le 700 && test "$(wc -l < apps/infrastructure/src/lib/infrastructure/project-github-sync.ts)" -le 700` | both authored/edited modules stay within the hard ceiling |
| Typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** extract the GitHub fetch/normalization and set-reconciliation
orchestration from the existing 826-line `projects.ts` into
`project-github-sync.ts` with its focused test while retaining the public
`syncInfrastructureProject` export; keep `projects.ts` below 700 lines. Add a
colocated sync-route test only if needed to freeze the sanitized response.

**Out of scope:** schema/migrations, GitHub App/private-repository support,
background jobs, UI changes, deployment state, Web's dead Infrastructure fork,
API response redesign, or production operations.

## Steps

1. Extract the GitHub sync boundary into the named sibling module and leave a
   stable thin export/wrapper in `projects.ts`; do not duplicate database or
   provider logic. Inject GitHub fetch and SQL transaction seams. Add failing
   tests for 150 branches/two pages, 10,000 ceiling, invalid/failed later page,
   duplicate conflict, empty snapshot, stale deletion, and selected branch
   beyond page one. Verify both authored modules remain below 700 lines.
2. Implement generated page URLs and strict response validation. Fetch pages
   sequentially to respect provider limits; keep memory bounded by the explicit
   10,000 ceiling.
3. Materialize normalized rows only after complete fetch. In one transaction,
   update project metadata, bulk-upsert the snapshot, and delete stale names.
   Tests must assert a constant number of persistence statements independent of
   branch count and zero statements after provider failure.
4. Preserve route error sanitization and response shape. Run focused tests,
   typecheck, production build, `bun check`, and whitespace verification.

## Done criteria

- [ ] Repositories with more than 100 branches reconcile all pages.
- [ ] Failed/oversized snapshots cause zero writes and zero stale deletion.
- [ ] Successful snapshots remove deleted branches and use constant-query persistence.
- [ ] The extracted sync module and retained projects module are each at most 700 lines.
- [ ] Existing project and route response contracts remain unchanged.
- [ ] Focused tests, typecheck, build, repository, and whitespace pass.

## STOP conditions

Stop on exact-path ownership, provider behavior that prevents detecting a
complete bounded snapshot, a required schema change, inability to preserve the
response/error contract, unrelated setup drift, or a mandatory gate failing
twice.
