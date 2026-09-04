# Plan 196: Update FREE AI Credit Allocations Atomically

> **Executor instructions:** Commit the FREE-plan allocation and every current
> user balance derived from it in one serialized database transaction. A
> propagation failure must roll back the allocation and return non-success.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/infrastructure/src/app/api/v1/admin/ai-credits/allocations apps/database/supabase/migrations apps/database/supabase/tests packages/payment-core/src/ai-credits-helper.ts packages/types/src/supabase.ts`
> Stop if allocation persistence or balance-period semantics changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / billing integrity / tests
- **Depends on:** Plan 154 must restore the full isolated pgTAP baseline; Plan
  146/generated-type ownership must transfer; execute from Plan 163's completed
  isolated-typegen base
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The Infrastructure admin route first commits a new FREE monthly allocation and
then separately updates current user balances. The second failure is only
logged while HTTP 200 is returned, and concurrent PUTs can interleave the two
writes. Persisted balances drive actual included-credit entitlement, so this can
split users between old and new billing limits while the control plane reports
success.

## Current state

- `apps/infrastructure/src/app/api/v1/admin/ai-credits/allocations/route.ts:182-231`
  reads the allocation and commits its update independently.
- Lines 240-268 separately update current-period FREE user balances; an error is
  logged and still returns 200 with `balances_updated`.
- `packages/payment-core/src/ai-credits-helper.ts:128-146` derives usable
  included credits from each balance's persisted `total_allocated`.
- The route directory contains no test for rollback, overlap, or response count.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, and
`vercel-react-best-practices` only if UI code unexpectedly enters scope (then
STOP). Read root and Infrastructure instructions. Obtain the named ownership
transfers, use the completed Plan 163 base after Plan 154, create an isolated
worktree, and run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/infrastructure vitest run src/app/api/v1/admin/ai-credits/allocations/route.test.ts` | success, rollback, no-op, and failure envelopes pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-credit-plan-allocation-update.sql` | transaction and two-session serialization assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | complete pgTAP suite passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-credit-plan-allocation-update.sql` | generated types match the committed RPC signature |
| Generated diff | `git diff --check -- packages/types/src/supabase.ts` | generated change is well formed and limited to the new private RPC signature |
| Typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the allocation route and a colocated test; one private
service-role-only transactional RPC migration; focused pgTAP; generated types
only when isolated typegen proves a necessary signature change.

**Out of scope:** allocation UI; bonus-credit ledger semantics from Plan 146;
paid-tier per-seat allocation; changing period boundaries; historical-period
rewrites; production migration application.

## Git workflow

Use `fix/atomic-free-credit-allocation` and commit
`fix(infrastructure): update free credit allocations atomically`. Claim/release
the commit window; do not push or open a PR.

## Steps

1. Add route tests that freeze authorization/validation, current successful
   response shape, propagation failure as non-success, no-op behavior, and
   authoritative affected-row count. **Verify:** tests fail only on the current
   split-write behavior.
2. Add a private service-role-only RPC that locks the target allocation,
   validates it is the intended FREE row, applies the requested allocation
   fields, and updates exactly current-period user-level balances in the same
   transaction. Return the updated allocation plus affected count. Reject stale
   compare-and-swap input or serialize overlapping calls so the final allocation
   and every derived balance always agree. Revoke the exact new function
   signature from `PUBLIC`, `anon`, and `authenticated`, and grant only
   `service_role`; pgTAP must assert the catalog ACL and direct denial for each
   untrusted role. **Verify:** focused pgTAP covers rollback on injected
   propagation failure, no-op, wrong tier/id, and final state. For the race,
   use the reset stack's single seeded FREE allocation (the tier column is
   unique): snapshot every field the test will mutate in a main-session temp
   table, insert uniquely identified committed auth-user/current-period balance
   fixtures through the setup connection, and target the seeded allocation.
   In the pgTAP file build the local
   connection string as
   `format('dbname=%s user=%s', current_database(), current_user)`, then call
   `extensions.dblink_connect` for uniquely named setup, worker-one, worker-two,
   and cleanup connections. Commit fixtures with `extensions.dblink_exec` on
   setup. Then begin a new setup transaction and lock the seeded FREE allocation
   row; issue both RPC calls with `extensions.dblink_send_query`; assert both
   named workers report busy while blocked on that row; commit setup to release
   the barrier; only then collect both via `extensions.dblink_get_result`.
   Assert allocation and
   every fixture balance equal the serialized winner; restore the seeded FREE
   allocation from the captured snapshot and delete the committed user/balance
   fixtures through the cleanup connection on both success and assertion
   failure; rollback/release the setup transaction first on any exceptional
   path; assert the restored row equals the snapshot and no fixture remains;
   disconnect every named connection. This uses the disposable
   database's local socket/current role and needs no host, password, or runner
   change. Never invent or persist credentials. STOP before implementation if
   this exact local connection cannot be opened by a red harness probe.
3. Replace the two route writes with the RPC and map database failures to the
   existing sanitized 500 envelope. Do not report success after partial work.
   **Verify:** focused route tests pass and assert one mutation call.
4. Run full isolated DB/typegen, Infrastructure typecheck/build, repository,
   and whitespace gates.

## Done criteria

- [ ] FREE allocation and current-period user balances commit or roll back
      together.
- [ ] The private RPC is executable only by `service_role`; `PUBLIC`, `anon`,
      and `authenticated` are denied by explicit signature-level ACLs.
- [ ] Overlapping updates cannot leave allocation and balances inconsistent.
- [ ] Failure is non-2xx; success returns an authoritative affected-row count.
- [ ] Paid tiers, historical periods, and bonus-credit fields are unchanged.
- [ ] Focused/full DB, route, typecheck/build, repository, and whitespace gates
      pass.

## STOP conditions

Stop on unresolved ownership, Plan 154 not DONE, ambiguous FREE-row uniqueness
or period semantics, inability to run a real two-connection database test, a
required paid-tier redesign, or a mandatory gate failing twice.
