# Plan 140: Cap Finance Transaction Pages Before Enrichment

> **Executor instructions:** Bound and validate the interactive infinite-scroll
> page size before it reaches the transaction RPC or enrichment work, without
> changing cursor or filter semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/finance/src/app/api/workspaces/[wsId]/transactions/infinite/route.ts' 'apps/finance/src/app/api/workspaces/[wsId]/transactions/infinite/route.test.ts' 'apps/finance/src/app/api/workspaces/[wsId]/transactions/list-enrichment.ts' apps/database/supabase/migrations/20260503100000_add_transaction_type_filter_to_transaction_rpcs.sql tmp/agent-coordination`
> The enrichment helper, SQL function, and coordination notes are read-only
> evidence. Stop on request, response, caller, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** performance / bug
- **Depends on:** Finance application ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route forwards a caller-controlled `limit + 1` to SQL and enriches every
returned transaction. An authorized viewer can turn a nominal 20-row scroll
request into a very large database query, enrichment batch, JSON response, and
malformed values can become avoidable 500s.

## Current state

- `transactions/infinite/route.ts:31-35` uses `parseInt(... || '20')` without
  checking integer syntax, positivity, finiteness, or a maximum.
- Route lines 77-115 pass `limit + 1` directly to
  `get_wallet_transactions_with_permissions`, slice by the same value, and send
  every retained ID into `loadTransactionListEnrichment`.
- The SQL function accepts nullable `p_limit` and applies it directly as
  `LIMIT`; this plan bounds the interactive HTTP boundary and does not alter
  shared/export RPC semantics.
- The existing route suite covers only `limit=20` success/enrichment failures.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not begin until
`20260709-123138-claude-finance-inventory-migration.md` transfers the exact
Finance route/test. Confirm repository callers use the default or a value no
greater than 100; exports must use their own endpoint rather than this UI route.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/finance vitest run 'src/app/api/workspaces/[wsId]/transactions/infinite/route.test.ts'` | all page-bound, cursor, enrichment, and existing cases pass |
| Finance typecheck | `bun run --cwd apps/finance type-check` | exit 0 |
| Finance build | `bun run --cwd apps/finance build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** infinite transaction route and its existing test; README status.

**Out of scope:** shared RPC SQL, exports, cursor encoding, filters, enrichment
fallback semantics, response shape, UI copy, migrations/types, other Finance
routes, Web/Rust/TanStack artifacts.

**Read-only drift evidence:** enrichment helper, SQL function, callers, and
coordination notes.

## Git workflow

After transfer use `perf/cap-finance-transaction-pages`, run `bun setup`, and
commit `perf(finance): cap transaction page size`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Freeze parsing and downstream work

Extend the existing suite for absent/default 20, `1`, `100`, `101`, `0`,
negative, decimal, whitespace, nonnumeric, repeated, and extremely large limit
values. Assert the exact `p_limit` sent to the main RPC and the maximum number
of IDs sent to enrichment; retain cursor and `hasMore` behavior at boundaries.

**Verify:** the focused suite fails only on invalid/oversized live behavior and
keeps the existing three tests green.

### Step 2: Parse one bounded interactive page contract

Use a small strict helper/schema: one optional base-10 integer query value,
default 20, minimum 1, maximum 100. Reject invalid or repeated `limit`
parameters with `{message:'Invalid limit'}` and status 400; do not silently
truncate malformed input. Send at most 101 to SQL, retain at most 100, and
enrich at most 100 IDs. Do not change any other query parameter.

**Verify:** focused tests pass and explicitly prove neither RPC nor enrichment
runs for invalid limits.

### Step 3: Run all gates

Run the focused suite, Finance typecheck/build, `bun check`, and whitespace.
Confirm only the route/test plus README changed.

## Done criteria

- [ ] Valid page size is an integer from 1 through 100, defaulting to 20.
- [ ] Invalid/repeated values return stable 400 before database work.
- [ ] Main RPC receives at most 101 and enrichment receives at most 100 IDs.
- [ ] Cursor, filters, response shape, and authorized behavior remain unchanged.
- [ ] Focused, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if Finance ownership is not transferred, a tracked interactive caller
requires more than 100, export code uses this route, the response contract has
drifted, a database change appears necessary, or a gate fails twice.

## Maintenance notes

Keep export/bulk retrieval separate from interactive pagination. If the shared
RPC later gets a server-side safety ceiling, preserve a lower UI page maximum.
