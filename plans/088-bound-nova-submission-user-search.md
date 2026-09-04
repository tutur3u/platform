# Plan 088: Bound and Authorize the Nova Submission Directory

> **Executor instructions:** Replace the challenge-submission page's global
> user dump with a bounded, authorized server search and clamp submission
> pagination. Preserve selected-user deep links and private-email access rules.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/nova/src/app/[locale]/(dashboard)/(admin)/(challenge-management)/submissions' 'apps/nova/src/app/api/v1/nova/challenge-management/users/search' apps/nova/src/lib/challenge-management-auth.ts packages/internal-api/src/nova.ts packages/internal-api/src/nova.test.ts packages/internal-api/src/index.ts apps/nova/messages`
> Stop on challenge-admin authorization, filter, or pagination drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `c4a75248aab5310c72d5cc07549b88cdf5f15316`
  on branch `perf/bound-nova-submission-search`; 23 focused tests, both
  typechecks, i18n sorting, Nova build, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** security / performance
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every submissions-page render queries and serializes the global user table plus
private emails, then filters and renders it in the browser. Work grows with all
platform users, and an unbounded `pageSize` URL also controls the submissions
range.

## Current state

- `submissions/server-component.tsx:42-55` parses page/pageSize without schema
  validation or a maximum.
- `server-component.tsx:93-111` selects every user and private email.
- `submissions/filters.tsx:72-85,188-224` filters and renders that array in a
  client `useEffect`.
- Plans 012-014 cover Nova security and Plan 084 covers leaderboards; none owns
  this admin filter.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`vercel-react-best-practices`. This global submissions page and its platform
user/email directory must require `canManageNovaChallengesGlobally`; the broad
layout's `allow_challenge_management` check is insufficient. Assigned-only
challenge managers must be denied this global page/search and continue through
their challenge-scoped result surfaces.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Nova tests | `bun run --cwd apps/nova test -- 'src/app/[locale]/(dashboard)/(admin)/(challenge-management)/submissions/submissions-user-search.test.tsx'` | bounds/auth/search tests pass |
| Search route test | `bun run --cwd apps/nova test -- 'src/app/api/v1/nova/challenge-management/users/search/route.test.ts'` | authorization/query contract passes |
| Internal API test | `bun run --cwd packages/internal-api test -- src/nova.test.ts` | typed caller contract passes |
| Internal API typecheck | `bun run --cwd packages/internal-api type-check` | exit 0 |
| Nova typecheck | `bun run --cwd apps/nova type-check` | exit 0 |
| Localization | `bun i18n:sort` | Nova English/Vietnamese bundles sorted |
| Nova build | `bun run --cwd apps/nova build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Nova challenge-submission server component and filters
- `apps/nova/src/app/api/v1/nova/challenge-management/users/search/route.ts`
  and `route.test.ts`
- `packages/internal-api/src/nova.ts`, `nova.test.ts`, and `index.ts` for the
  typed bounded search facade
- Nova English/Vietnamese messages for existing hard-coded search copy
- `plans/README.md` only for status

Do not change submission grading, challenge role semantics, global user schema,
or leaderboard pagination.

## Git workflow

Use branch `perf/bound-nova-submission-search` in an isolated worktree and run
`bun setup`. Commit `perf(nova): bound submission user search`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Define fixed bounds

Validate page as an integer at least 1 and pageSize as one of `10, 20, 50`,
defaulting invalid values to 10. Define user search as trimmed email text with
minimum 2 characters, maximum 100, 20 results, and no wildcard-only query.
At the submissions server-component boundary, resolve the Nova app-session actor
and require `canManageNovaChallengesGlobally` before statistics, challenge,
submission, or private-user queries; redirect/deny assigned-only managers.

### Step 2: Add authorized server search

Create the named Nova-local GET route and require
`canManageNovaChallengesGlobally` from
`apps/nova/src/lib/challenge-management-auth.ts` before any private-email
query. Return only `{ id, display_name, email }`, escape SQL wildcard
characters, and apply deterministic `(email, id)` ordering plus the 20-row
limit. Let `selectedUserId` request one exact additional authorized projection
so a deep-link user remains labeled when absent from the result page. Expose
this exact response through `packages/internal-api/src/nova.ts` and `index.ts`.

### Step 3: Replace the client dump

Stop fetching users in the page server component. Use debounced TanStack Query
through the new internal-api facade, keep stale-response keys isolated by term
and selected ID, and render at most 20 search options plus the one selected
projection. Remove the filtering `useEffect`; preserve URL filters and
selected-user clearing behavior. Move visible search/empty copy to both locale
bundles.

### Step 4: Characterize and verify

Test global manager success plus assigned-only, disabled, unrelated-target, and
anonymous denial before admin access; also cover bounds, wildcard escaping,
empty/short terms, deterministic truncation, stale terms, deep-link selection,
and invalid page parameters. Run the focused suite, typecheck, i18n sort,
production build, and repository gate.

## Done criteria

- [ ] No submissions render loads the global user collection.
- [ ] The global submissions page and private-email search require global Nova
      challenge management; assigned-only managers cannot query either.
- [ ] Private-email search returns at most 20 projections.
- [ ] pageSize is constrained to 10/20/50 and page is positive.
- [ ] Selected-user deep links remain labeled and removable.
- [ ] Focused tests, localization, Nova build, and repository gates pass.

## STOP conditions

Stop if there is no stable challenge-admin capability, an external caller
requires a different response, private-email search cannot be bounded safely,
or a gate fails twice.

## Maintenance notes

Never pass the platform user directory through an RSC payload for a combobox;
keep both authorization and result bounds at the server query.
