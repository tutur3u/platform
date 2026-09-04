# Plan 111: Bound Forms Response Page Materialization

> **Executor instructions:** Make a paginated Forms response request fetch only
> the displayed response rows and answers. Use the existing database rollup RPC
> for whole-result analytics; do not silently change response shapes, filters,
> or the separate export contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/forms/src/features/forms/server apps/forms/src/features/forms/response-analytics.ts 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/[formId]/responses' 'apps/forms/src/app/[locale]/[wsId]/forms/[formId]/page.tsx' apps/database/supabase/migrations/20260531210558_move_forms_private.sql apps/database/supabase/tests/private-schema-forms.sql tmp/agent-coordination`
> Stop on Forms response-query/rollup drift or until the broad Forms handoff is
> canonicalized and ownership is explicitly transferred.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** performance
- **Depends on:** Forms satellite ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every nominally paginated response page still retrieves every matching
response ID, every matching response metadata row, and every matching answer
row to build analytics. Runtime transfer and memory therefore grow with the
entire form history even when the UI renders ten rows.

## Current state

- `server/queries.ts:99-153` requests a bounded response page and the complete
  matched-ID set in parallel, then fetches metadata/answers for all IDs.
- Lines 155-185 render only `pagedResponses`, discarding most fetched rows
  after using them for summary/analytics.
- `private.get_form_response_page` already returns `total_count`, and
  `private.get_form_response_rollups` already computes summary/question
  analytics in the database.
- The broad top-level Forms migration handoff remains nonterminal under
  coordination rules and claims `apps/forms/**`.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; load
`$tuturuuu-database` only if current drift proves the existing RPC contract
must change. Obtain explicit Forms ownership transfer before editing. This plan
expects no schema or generated-type change at the audited snapshot.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused query tests | `bun --cwd apps/forms vitest run src/features/forms/server/queries.test.ts` | page-only answer fetch and rollup mapping pass |
| Existing analytics tests | `bun --cwd apps/forms vitest run src/features/forms/response-analytics.test.ts` | existing analytics semantics remain green |
| Forms typecheck | `bun run --cwd apps/forms type-check` | exit 0 |
| Forms build | `bun run --cwd apps/forms build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/forms/src/features/forms/server/queries.ts`
- a new `apps/forms/src/features/forms/server/queries.test.ts`
- a small typed rollup decoder/helper under the same server folder if needed
- `plans/README.md` only for status

Do not change form submission, analytics definitions, response export limits,
database schema, generated types, or UI copy.

## Git workflow

Use branch `perf/forms-response-pages` in an isolated worktree and run
`bun setup`. Commit `perf(forms): bound response page materialization`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Lock the public result contract

Add fixtures for an empty result, one page from a large matched set, filtered
results, multi-choice answers, and malformed/null rollup values. Assert the
returned `total`, `records`, `summary`, and `questionAnalytics` shapes remain
identical to current callers.

### Step 2: Use page count and database rollups

Read `total`, `summary`, and `questionAnalytics` from
`get_form_response_rollups`, whose existing JSON contract includes all three;
assert that a nonempty page's `total_count` agrees with the rollup total. This
also preserves the correct total for an out-of-range empty page. Decode the
rollup into the existing domain types and do not fetch the full matched-ID list
in the TypeScript request path.

### Step 3: Fetch answers only for displayed records

Pass only the current page's response IDs to answer retrieval. Eliminate the
all-matched metadata fetch. Preserve ordering, stored-question normalization,
query filtering, and empty-page behavior.

### Step 4: Prove bounded query shape

Use a synthetic large-match fixture to assert answer retrieval receives at
most `pageSize` IDs and that no call to `get_form_matched_response_ids` is made
directly by the TypeScript request path. Run focused tests, typecheck, the Forms
build, and `bun check`.

## Done criteria

- [ ] A page of N records fetches at most N records' answer rows in TypeScript.
- [ ] Whole-result analytics come from the existing rollup RPC.
- [ ] Result shapes and filtering semantics remain unchanged.
- [ ] No schema, generated type, export, or user-copy change is introduced.
- [ ] Focused tests, Forms typecheck/build, and repository gates pass.

## STOP conditions

Stop if Forms ownership is not transferred, the deployed private RPC differs
from the audited migration, rollup parity fails on existing fixtures, or an
out-of-range page cannot report total without a bounded query.

## Maintenance notes

Pagination is not bounded if page rendering still materializes the complete
matching dataset for secondary calculations.
