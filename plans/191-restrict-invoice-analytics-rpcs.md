# Plan 191: Restrict Invoice Analytics RPCs to Authorized Server Callers

> **Executor instructions:** Close direct Data API access to invoice analytics
> and bound database work while preserving Finance and prepared Rust responses.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/analytics' apps/backend/src/workspaces_finance_invoices_analytics.rs apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / performance / database authorization
- **Depends on:** Plan 154 (BLOCKED); Finance/Inventory database and G19 backend review/transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Four definer RPCs accept an arbitrary workspace and return invoice totals,
wallet names, creator identities, avatars, and counts without checking the
caller. Default function ACLs expose them to anonymous and authenticated Data
API clients, bypassing the maintained route's `view_invoices` check. Unbounded
date ranges also drive `generate_series` directly in PostgreSQL.

## Current state

- `20260127025639_support_invoice_creator_filters_for_workspace_and_platform_ids.sql:1-217`
  defines `get_invoice_totals_by_date_range`; creator grouping joins user and
  private-detail identity fields without authorization.
- The same migration defines daily, two weekly overloads, and monthly invoice
  RPCs at lines 219-542. They trust date/count/filter parameters and workspace.
- `apps/finance/.../analytics/route.ts:23-43` resolves the Finance actor and
  requires `view_invoices`; `analytics-rpc.ts:52-243` uses an admin client.
- `apps/backend/src/workspaces_finance_invoices_analytics.rs` repeats the route
  permission check and calls the RPCs with the service-role key. Prepared Rust
  parity therefore remains compatible with service-role-only ACLs.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Finance, and backend instructions. Obtain the canonically working Finance owner
and G19 review before touching shared contracts. Execute after Plan 154 is green.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "get_(invoice_totals_by_date_range|daily_invoice_totals|weekly_invoice_totals|monthly_invoice_totals)" apps packages --glob '!packages/types/src/supabase.ts'` | only Finance admin and prepared Rust service callers remain |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/invoice-analytics-rpc-permissions.sql` | ACL, tenant, overload, and date-bound matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Finance focused | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/invoices/analytics/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/finance/invoices/analytics/analytics-query.test.ts'` | exact range/count 400 contract and authorized success pass |
| Backend focused | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_finance_invoices_analytics` | service-role request and response parity passes |
| Backend full | `bun check:backend` | exit 0 |
| Finance typecheck | `bun run --cwd apps/finance type-check` | exit 0 |
| Finance build | `bun run --cwd apps/finance build` | production build exits 0 |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no signature/type drift |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** additive replacement/ACL migration for every live overload of the
four invoice analytics names; one focused pgTAP suite; Finance query/route
validation and focused tests; matching Rust validation/tests and OpenAPI 400
contract.

**Out of scope:** successful response/chart redesign; moving route ownership;
changing invoice calculations; generated types; production apply; new indexes.

## Git workflow

After transfers, use `fix/restrict-invoice-analytics-rpcs` and commit
`fix(finance): restrict invoice analytics RPCs`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Enumerate every overload, ACL, and runtime caller. Freeze the Finance and
   Rust success/error envelopes. **Verify:** caller inventory shows no supported
   caller-token or browser RPC use.
2. Add an additive migration with fixed search paths, explicit revocation from
   `PUBLIC`/`anon`/`authenticated`, and service-role-only grants for every exact
   signature. **Verify:** pgTAP checks privileges by full identity and proves
   anonymous/authenticated execution fails for each overload.
3. Reuse the repository's existing Finance chart contract from
   `20260601204023_guard_finance_chart_date_ranges.sql`: reject reversed ranges;
   allow at most 366 days for daily output and 3,660 days for weekly/monthly
   output. For count-only inputs enforce `past_days` 1..366, `past_weeks`
   1..523, `past_months` 1..120, and `week_start_day` 0..6; do not silently
   clamp. **Verify:** exact boundary values pass, the next value fails before
   `generate_series`, and normal fixture totals remain byte-equivalent.
4. Enforce the same selected/derived interval bounds before RPC dispatch in
   Finance and Rust. Preserve authorization-before-query-validation order.
   Finance must return its existing Zod-style 400 envelope
   `{ message: 'Invalid query parameters', issues }`; Rust must return its
   existing 400 `{ message: 'Invalid query parameters' }`. Add the exact limits
   and 400 response to backend OpenAPI. **Verify:** route/Rust tests cover
   reversed, daily 366/367, extended 3,660/3,661, and auto-derived interval
   cases, and assert no RPC on rejection.
5. Run focused/full database, Finance build, backend, type-drift, repository, and
   whitespace gates.

## Done criteria

- [ ] No anonymous/authenticated client can query invoice analytics directly.
- [ ] Finance and Rust service-role callers retain response parity.
- [ ] All range/count inputs have a single explicit database ceiling.
- [ ] Finance and Rust reject invalid/oversized ranges with their documented
      400 envelopes before RPC dispatch.
- [ ] Every overload is covered and types do not drift.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on red Plan 154, Finance/G19 ownership, a supported caller-token consumer,
the existing 366/3,660-day Finance guard being unavailable, overload mismatch,
unexpected type drift, Rust
parity drift, or any mandatory gate failing twice.
