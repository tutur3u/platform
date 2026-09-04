# Plan 251: Fail Closed During Polar Subscription Reconciliation

> **Executor instructions:** Fix both proven fail-open subscription paths: a
> Polar list failure must never lead to creation of a free subscription, and a
> workspace lookup failure must never be interpreted as proof that an active
> Polar subscription is orphaned. Preserve genuine already-active, missing-
> workspace, soft-deleted-workspace, sync, and operator-stream behavior.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/payment-core/src/subscription-helper.ts packages/payment-core/src/subscription-helper.test.ts packages/payment-core/src/subscription-helper.free.test.ts 'apps/pay/src/app/api/payment/migrations/subscriptions/cross-check/phase-2/route.ts' 'apps/pay/src/app/api/payment/migrations/subscriptions/cross-check/phase-2/route.test.ts' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Pay migration handoff owns
  `apps/pay/**` and `packages/payment-core/**`; obtain exact-path transfer
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / billing / test coverage
- **Depends on:** exact-path transfer from the Pay migration handoff
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Two error sentinels are currently converted into destructive or duplicating
provider actions. A failed Polar active-subscription lookup is intentionally
represented as active, but the free-subscription creator continues because no
concrete subscription object accompanies the sentinel. Separately, Phase 2
ignores a database workspace lookup error and revokes the active provider
subscription as though absence had been proven. Transient provider or database
failure can therefore create duplicate billing state or revoke a valid paid
subscription.

## Current state and exact contract

- `packages/payment-core/src/subscription-helper.ts:64-84` catches Polar list
  failure and returns `{ hasWorkspace: true, hasActive: true, subscription:
  null }`, with an explicit fail-closed comment.
- `subscription-helper.ts:93-112` stops only for `hasActive && subscription`.
  The error sentinel therefore continues through product lookup and reaches
  `polar.subscriptions.create` at lines 170-177.
- `packages/payment-core/src/subscription-helper.test.ts:208-277` asserts the
  intended fail-closed sentinel. Existing create composition tests cover a
  concrete active subscription, not the list-failure sentinel.
- `apps/pay/src/app/api/payment/migrations/subscriptions/cross-check/phase-2/route.ts:89-115`
  destructures only workspace `data`. Query failure yields falsy data, sets
  `isOrphan`, and calls `polar.subscriptions.revoke`.
- Keep the existing `hasActiveSubscription` return shape for its other Pay and
  Web callers. In `createFreeSubscription`, any `hasActive` result must stop:
  return the existing `already_active` result only when `subscription` exists;
  otherwise return `{ status: 'error', message: 'Unable to verify active subscriptions' }`.
  Do not query a product or call `subscriptions.create` in the error-sentinel
  branch.
- In Phase 2, inspect `{ data, error }`. On lookup error, increment `errors`, add
  one `errorDetails` entry for that Polar subscription with prefix
  `Workspace lookup failed:`, send the normal progress event, and skip both
  `revoke` and `syncSubscriptionToDatabase`. Only absent metadata, a successful
  lookup returning no row, or a successfully read row with `deleted === true`
  is an orphan.
- Preserve the NDJSON HTTP/status shape and all counters. A per-item lookup
  failure remains observable in the final `complete` event; it must not abort
  the rest of the bounded provider page.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS and the Pay handoff. Do not create a
worktree until the owner transfers these exact paths. This plan has no schema,
Rust, TanStack-manifest, or provider-dashboard change.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'hasActiveSubscription\(|createFreeSubscription\(' apps packages --glob '!plans/**'` | every caller remains compatible with the unchanged helper result shape |
| Payment-core tests | `bun --cwd packages/payment-core vitest run src/subscription-helper.test.ts src/subscription-helper.free.test.ts` | list failure returns an error from create and provider create is never called; existing cases pass |
| Phase-2 route | `bun --cwd apps/pay vitest run 'src/app/api/payment/migrations/subscriptions/cross-check/phase-2/route.test.ts'` | lookup error, absent, deleted, valid sync, and provider failures pass |
| Types | `bun run --cwd packages/payment-core type-check && bun run --cwd apps/pay type-check` | exit 0 |
| Pay build | `bun run --cwd apps/pay build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** `subscription-helper.ts`; its two existing focused test files;
the Phase 2 Pay migration route; one new colocated Phase 2 route test.

**Out of scope:** changing the `hasActiveSubscription` public shape or every
caller; subscription deduplication policy; provider pagination/concurrency;
other cross-check phases; database schema/types; Pay UI; Web routes; Rust;
TanStack migration artifacts; production provider or migration operations.

## Steps

1. Add a red composition test in the existing payment-core suite: make
   `subscriptions.list` reject, call `createFreeSubscription`, assert the exact
   error result, and assert product lookup and `subscriptions.create` are not
   called. Keep the direct fail-closed helper tests green.
2. Change only the active-result decision in `createFreeSubscription`: concrete
   active subscriptions retain `already_active`; the null-subscription active
   sentinel returns the exact error before any other read or provider write.
3. Add a Phase 2 route suite using the existing Pay route mocking conventions.
   Stub `createNDJSONStream` so the callback executes and emitted events can be
   asserted without a live stream. Cover lookup error, missing metadata, absent
   workspace, soft-deleted workspace, valid workspace sync, revoke failure, and
   sync failure.
4. Destructure and handle the workspace query error before absence. Record the
   error and continue to the next subscription without either provider
   mutation. Preserve genuine orphan revocation and final counters/messages.
5. Run the focused tests, both typechecks, Pay production build, `bun check`,
   whitespace, and exact-scope checks.

## Done criteria

- [ ] Polar list failure cannot reach free-product lookup or subscription
      creation.
- [ ] Workspace query failure cannot call Polar revoke or local sync and is
      represented in the operator stream as an error.
- [ ] Genuine missing/deleted workspaces still revoke; valid workspaces still
      sync; existing success/result shapes remain unchanged.
- [ ] All commands above pass and no out-of-scope file changes.

## STOP conditions

Stop on missing ownership transfer, a changed helper/result contract, another
caller that requires the null-subscription active sentinel to mean success, an
unmockable streaming boundary that would require production refactoring, need
for schema/provider-dashboard changes, or any mandatory gate failing twice.

## Maintenance notes

Reviewers should look for provider calls, not just returned counters. Future
reconciliation changes must preserve the distinction between proven absence
and unavailable evidence: only the former authorizes destructive provider work.
