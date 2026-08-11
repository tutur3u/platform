# Plan 089: Paginate GitHub Detail Collections Explicitly

> **Executor instructions:** Make incomplete GitHub issue, pull, and workflow
> collections explicit and incrementally pageable. Do not eagerly exhaust every
> GitHub page or silently preserve first-page-as-complete semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/git/src/lib/github apps/git/src/components/repository 'apps/git/src/app/[locale]/[owner]/[repo]/[[...view]]/page.tsx' apps/git/messages/en.json apps/git/messages/vi.json`
> Stop on GitHub request, detail-query, or repository-detail UI drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Git production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/perf-paginate-github-details`. Current main also advanced to
  `52f4aa1b12` and changed the scoped repository page to use request-root
  `getTranslations('git')`; continuation must replay/rebase the retained work
  onto that locale contract before rerunning gates.
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness / performance / tests
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Issue comments, pull files/reviews, and workflow jobs/artifacts make one GitHub
request and are rendered as complete. Large resources are silently truncated;
automatically fetching all pages would replace that bug with unbounded fan-out.

## Current state

- `apps/git/src/lib/github/api.ts:9-47` returns only the decoded body and drops
  pagination headers.
- `queries.ts:255-318` omits page parameters for comments/reviews and caps pull
  files at one 100-row response.
- `queries.ts:173-215` does the same for jobs and artifacts.
- `repository-detail.tsx` has no partial-result or continuation affordance, and
  no current test imports these collection queries.
- Main commit `52f4aa1b12` removed the page's explicit `locale` translation
  argument. The retained pagination implementation predates that change; its
  search-parameter work must preserve the new request-root locale resolution.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`vercel-react-best-practices`. Use GitHub's `Link` response header as the
continuation source; do not infer completeness only from array length.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Git tests | `bun run --cwd apps/git test -- src/lib/github/pagination.test.ts src/components/repository/repository-detail-pagination.test.tsx` | query and UI contracts pass |
| Git typecheck | `bun run --cwd apps/git type-check` | exit 0 |
| Localization | `bun i18n:sort` | Git English/Vietnamese bundles sorted |
| Git build | `bun run --cwd apps/git build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- GitHub request/query modules and new focused tests
- repository detail page/component and focused pagination UI tests
- app-local types needed for `{ items, nextPage }`
- `apps/git/messages/en.json` and `apps/git/messages/vi.json` for page,
  previous/next, partial-result, and collection-failure copy
- `plans/README.md` only for status

Do not change installation-token acquisition, repository registration, webhook
ingestion, GitHub write operations, or cache lifetimes unrelated to page keys.

## Git workflow

Use branch `perf/paginate-github-details` in an isolated worktree and run
`bun setup`. Commit `perf(git): paginate detail collections`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Model response metadata

Add a request variant that returns the decoded body plus whether the standard
`Link` header contains `rel="next"`, without changing existing scalar callers.
The caller computes `nextPage = currentPage + 1`; never follow or forward the
header URL itself.

### Step 2: Make collection queries page-aware

For issue comments, pull files, pull reviews, workflow jobs, and artifacts,
accept a positive page, request a fixed `per_page` (50; retain 100 for pull
files if needed for compatibility), return `{ items, nextPage }`, and include
the page in every cache tag/key. Keep the scalar issue/pull/run request separate.

### Step 3: Render honest partial state

Parse bounded positive page parameters in the existing repository page: use
separate `commentsPage`, `filesPage`, `reviewsPage`, `jobsPage`, and
`artifactsPage` values, each clamped to 1..1000. Show the selected page and
previous/next links per collection, with next only when `nextPage` exists. Keep
the other collection parameters and repository view intact when navigating.
Render every new label/error through the Git app's localized messages and add
the same keys in English and Vietnamese.

### Step 4: Lock contracts

Mock single-page, multi-page, malformed Link, and rate-limit responses. Test
independent URL continuation for comments, files/reviews, and jobs/artifacts,
invalid/oversized page normalization, plus a 150-file pull whose first page is
not presented as complete.

## Done criteria

- [ ] Every affected collection exposes explicit continuation/completeness.
- [ ] Initial detail rendering performs a bounded number of requests.
- [ ] Cache identity includes resource and page.
- [ ] Pagination controls preserve the repository view and never use a header URL.
- [ ] English/Vietnamese pagination copy is complete and sorted.
- [ ] Focused tests, Git build, and repository gates pass.

## STOP conditions

Stop if the configured GitHub host does not provide standard Link headers, a
consumer requires a complete unbounded array, cache primitives cannot separate
pages, or a gate fails twice.

## Maintenance notes

New GitHub collection queries must choose an explicit bounded page contract;
never treat one REST response as exhaustive without header evidence.
