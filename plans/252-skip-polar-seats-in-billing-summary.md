# Plan 252: Keep the Billing Summary Free of Polar Seat Fetches

> **Executor instructions:** Make the workspace billing-summary route use a
> database-only subscription summary. Preserve the existing full billing
> helper and every response field; the summary must not instantiate a Polar
> client or call the seat-list API.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/payment-core/src/billing-helper.ts packages/payment-core/src/billing-helper.test.ts 'apps/pay/src/app/api/v1/workspaces/[wsId]/billing/summary/route.ts' 'apps/pay/src/app/api/v1/workspaces/[wsId]/billing/summary/route.test.ts' packages/internal-api/src/pay.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Pay migration handoff owns
  the route and payment-core helper
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** performance / architecture / test coverage
- **Depends on:** exact-path transfer from the Pay migration handoff
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The no-store billing summary uses only local subscription, product, and
`seat_count` columns, but every request synchronously calls Polar to list full
seat details and discards the result. Settings loads therefore pay avoidable
network latency, provider rate-limit consumption, and error logging even
though their response is database-backed.

## Current state and exact contract

- `apps/pay/src/app/api/v1/workspaces/[wsId]/billing/summary/route.ts:37-55`
  creates a Polar client and calls `fetchSubscription`; the response never
  reads `seatList`.
- `packages/payment-core/src/billing-helper.ts:179-242` reads the active local
  subscription and private product, then always awaits
  `polar.customerSeats.listSeats` before returning `seatList`.
- `packages/internal-api/src/pay.ts:42-51` declares the summary request
  `cache: 'no-store'`, so the discarded provider call is paid on every load.
- The full Pay billing route/page uses `seatList` and must keep the existing
  `fetchSubscription(polar, supabase, wsId)` behavior and type unchanged.
- Extract the shared database reads into a private helper. Export a distinct
  `fetchSubscriptionSummary(supabase, wsId)` that returns only the fields
  needed by `WorkspaceBillingSummary`: status, current-period/cancel fields,
  product metadata, and `seatCount`. It accepts no Polar client and contains no
  provider call. Keep database error/null behavior byte-compatible unless a
  focused red test proves otherwise.
- The Pay summary route must remove `createPolarClient` entirely and call the
  DB-only helper. Its 401/403/200/500 envelopes and internal-api type stay
  unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS and the Pay handoff; wait for exact-path
transfer. No dependency, lockfile, schema, generated-type, Web/Rust, or route-
manifest change is permitted.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Call inventory | `rg -n 'fetchSubscription\(|fetchSubscriptionSummary\(' apps packages --glob '!plans/**'` | full callers still use the seat-aware helper; only summary callers use the DB-only helper |
| Focused tests | `bun --cwd packages/payment-core vitest run src/billing-helper.test.ts && bun --cwd apps/pay vitest run 'src/app/api/v1/workspaces/[wsId]/billing/summary/route.test.ts'` | DB/null/error fields and no-provider-call contract pass |
| Types | `bun run --cwd packages/payment-core type-check && bun run --cwd apps/pay type-check && bun run --cwd packages/internal-api type-check` | exit 0 |
| Pay build | `bun run --cwd apps/pay build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass; whitespace output is empty |

## Scope

**In scope:** payment-core billing helper; a new focused helper test; Pay's
billing-summary route and existing test. `packages/internal-api/src/pay.ts` is
verification-only unless type inference requires a type-only adjustment with
no public response change.

**Out of scope:** full billing route/page and seat UI; changing seat-list error
semantics for existing callers; caching policy; subscription mutation; schema
or generated types; dependencies/lockfile; Web/Rust parity; TanStack artifacts;
provider configuration.

## Steps

1. Add payment-core tests that distinguish database-only summary loading from
   the full seat-aware helper. Assert the summary result fields and prove a
   Polar object is neither required nor invoked.
2. Extract the repeated active-subscription/product lookup into a private
   shared function. Implement the exported summary helper on that result, and
   keep `fetchSubscription` as the only helper that lists and returns seats.
3. Update the Pay summary route to remove Polar construction and use the new
   helper. Update its mock to assert the DB-only helper receives only the admin
   client/workspace and `createPolarClient` is absent or never called.
4. Run focused tests, caller inventory, typechecks, Pay production build,
   repository, whitespace, and exact-scope gates.

## Done criteria

- [ ] Billing summary never constructs a Polar client or calls
      `customerSeats.listSeats`.
- [ ] Full billing callers retain the current seat-list behavior.
- [ ] `WorkspaceBillingSummary` and every HTTP/auth/error envelope are stable.
- [ ] All commands above pass with no out-of-scope diff.

## STOP conditions

Stop on missing ownership transfer, an unexpected summary consumer that needs
seat identities, inability to share the database lookup without changing full
billing semantics, required public response/dependency/schema changes, or any
mandatory gate failing twice.

## Maintenance notes

Keep summary reads provider-free. If a future summary genuinely needs seat
identities, add an explicit separately loaded detail contract rather than
silently reintroducing provider latency to the no-store settings request.
