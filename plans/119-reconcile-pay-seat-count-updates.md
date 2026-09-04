# Plan 119: Reconcile Pay Seat-Count Updates Durably

> **Executor instructions:** Characterize the Pay seat mutation end to end,
> then serialize provider updates and persist an explicit reconciliation state
> so a Polar success plus local failure is not reported as settled success.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/pay/src/app/api/payment/seats apps/pay/src/app/api/payment/webhooks apps/pay/src/app/'[locale]'/'[wsId]'/billing/adjust-seats-dialog.tsx apps/pay/messages packages/internal-api/src/pay.ts packages/internal-api/src/pay.test.ts packages/payment-core/src/polar-subscription-helper.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on Pay ownership, subscription schema, webhook, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness / test coverage
- **Depends on:** Pay migration owner and generated database type owners releasing or transferring scope
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route invoices the new seat count at Polar before updating the local row.
It returns HTTP 200 when that local write fails and merely assumes a later
webhook will converge. Overlapping owner requests can also reach Polar and the
database out of order, leaving billed seats, local enforcement, and AI
allocation inconsistent.

## Current state

- `apps/pay/src/app/api/payment/seats/route.ts:135-225` authenticates the owner,
  loads the active subscription, and derives bounds from members and product
  limits.
- Lines 228-270 call Polar with invoice proration, then write
  `workspace_subscriptions.seat_count` separately; local failure returns
  `success: true`.
- `packages/payment-core/src/polar-subscription-helper.ts:97-135` can later
  upsert provider state from a webhook, but no durable pending marker connects
  the request to that reconciliation.
- The webhook helper has mapping tests, while no seat-route suite covers auth,
  bounds, provider/local failures, overlap, or convergence.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. The Pay migration note remains a handoff over
`apps/pay/**`; obtain explicit transfer before editing. Recheck all active
generated-type and migration owners.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new reconcile_pay_seat_updates` | one additive migration created |
| Database tests | `bun --cwd apps/database scripts/run-supabase.js test db` | `subscription_seat_updates.sql`, including the two-connection overlap case, passes |
| Seat route | `bun --cwd apps/pay vitest run src/app/api/payment/seats/route.test.ts` | auth, bounds, failure, retry, and overlap pass |
| Seat caller | `bun --cwd apps/pay vitest run src/app/'[locale]'/'[wsId]'/billing/adjust-seats-dialog.test.tsx` | one UUID is reused across request retries and pending UI is truthful |
| Webhook convergence | `bun --cwd apps/pay vitest run src/app/api/payment/webhooks/route.test.ts` | pending state converges idempotently |
| Internal API | `bun run --cwd packages/internal-api test -- src/pay.test.ts && bun run --cwd packages/internal-api type-check` | idempotency header and response union are covered |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | Pay English/Vietnamese keys are sorted and aligned |
| Apply locally | `bun sb:up` | migration applies locally |
| Regenerate types | `bun sb:typegen` | only expected generated type changes |
| Package checks | `bun run --cwd packages/payment-core test && bun run --cwd packages/payment-core type-check` | exit 0 |
| Pay checks | `bun run --cwd apps/pay type-check && bun run --cwd apps/pay build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Pay seat route and a new colocated route test
- `apps/pay/src/app/[locale]/[wsId]/billing/adjust-seats-dialog.tsx` and a new
  colocated test
- `apps/pay/messages/en.json` and `apps/pay/messages/vi.json` for pending and
  terminal seat-update copy
- `packages/internal-api/src/pay.ts` and `packages/internal-api/src/pay.test.ts`
- Polar subscription webhook persistence helper and existing focused test
- one additive seat-update/reconciliation migration and
  `apps/database/supabase/tests/subscription_seat_updates.sql` (create)
- generated Supabase types after local apply
- `plans/README.md` only for status

Do not redesign products, pricing, checkout, billing UI, member invitations, or
AI-credit allocation policy.

## Git workflow

Use branch `fix/reconcile-pay-seat-updates` in an isolated worktree and run
`bun setup`. Commit `fix(pay): reconcile seat count updates durably`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the existing boundary

Create route tests for cookie and Pay/platform app-session owners, non-owners,
missing subscriptions, fixed-price products, member/min/max boundaries, Polar
failure, local-write failure, and a duplicate request. Preserve existing safe
validation and authorization responses. Characterize the dialog and typed
Internal API caller before changing their contracts.

### Step 2: Add a serialized update record

Create an additive private `subscription_seat_updates` table (or equivalently
named private state owned by the migration) keyed uniquely by
`(subscription_id, actor_id, request_id)`, where `request_id` is the required
UUID `Idempotency-Key` header resolved by the Pay server. Use statuses
`claimed`, `provider_applied`, `reconciliation_pending`, `completed`, and
`terminal_failed`. Add a partial unique index allowing at most one row per
subscription in the first three active statuses, and have the service-role-only
claim RPC lock the subscription row before checking/inserting. Record
requested/previous counts plus provider/local result metadata; revoke execution
from public roles and use a fixed search path.

### Step 3: Make request results truthful

Change `updatePaySubscriptionSeats` to accept the request UUID and emit it as
`Idempotency-Key`. Generate that UUID once in the dialog's deliberate submit
handler and carry it in the TanStack mutation variables so retries reuse it;
separate clicks get separate UUIDs. Before implementation, verify from the
installed Polar SDK/types and provider documentation that the seat-update call
accepts a stable provider idempotency/operation key; pass the same request UUID
through `RequestOptions` to that provider boundary. If Polar cannot guarantee
deduplication or authoritative lookup by that key, STOP rather than claiming
exactly-once effects. Claim or replay before calling Polar.
Completed retries return `200 { status: 'completed', newSeats }`; a different
active request returns `409 { error: 'seat_update_in_progress' }` without a
second provider call. A retry with the same key while its `claimed` lease is
live returns `202 { status: 'processing', requestedSeats }` without redispatch.
After an expired claim, reconcile by the provider operation key or safely
reissue with that same provider key only when the documented provider contract
deduplicates it. Deterministic provider rejection is persisted and replayed as
`502 { error: 'seat_update_failed' }`. After Polar success, persist
`provider_applied` before the local seat update. If that write fails, persist
`reconciliation_pending` and return
`202 { status: 'reconciliation_pending', requestedSeats }`, never
`success: true`. The dialog must not close or show a settled-success toast for
202; render localized pending copy and allow a later status refresh/retry to
replay the terminal result.

### Step 4: Reconcile from authoritative webhooks

Have the webhook upsert subscription seat state and idempotently complete any
matching pending update. Out-of-order older webhooks must not overwrite a newer
confirmed provider state; use provider modification/version evidence already
available in the payload, or STOP if Polar supplies no ordering signal.

### Step 5: Test overlap and recovery

In `subscription_seat_updates.sql`, create committed, uniquely named workspace,
actor, product, and subscription fixtures visible outside the pgTAP session.
Open two `extensions.dblink` connections to the local database, use
`dblink_send_query` to invoke the service-role claim concurrently for the same
subscription with different request UUIDs, and collect both results with
`dblink_get_result`. Assert exactly one active claim and one conflict/no-claim,
then clean up every committed fixture in both success and exception paths.
Route tests use deferred provider promises to prove no redispatch during a live
claim, provider-key reuse after an interrupted/expired claim, one effective
provider mutation, correct duplicate replay, pending local failure, webhook
convergence, and no stale overwrite. If the local pgTAP harness cannot open both
independent connections without inventing credentials, STOP rather than
substituting a mock concurrency test.

### Step 6: Apply and verify

Apply the migration locally, run pgTAP, regenerate types, run Pay/payment-core
and Internal API tests/typechecks, run `bun i18n:sort`, the Pay build,
`bun check`, and whitespace.

## Done criteria

- [ ] One subscription cannot have two active seat updates or two effective
      provider mutations for one request UUID.
- [ ] Provider success plus local failure is durable and reported as pending, not settled.
- [ ] Webhook convergence is idempotent and cannot overwrite newer seat state.
- [ ] Owner/app-session, bounds, failure, retry, and overlap cases are covered.
- [ ] Each deliberate UI submission creates one UUID, request retries reuse it,
      and pending state is localized rather than reported as settled.
- [ ] Migration, typegen, Pay build, package, and repository gates pass.

## STOP conditions

Stop if ownership is not transferred, Polar offers no stable provider-side
idempotency/operation identity or event ordering signal, existing production duplicates require operator
disposition, local concurrency testing cannot run, or an in-scope gate fails
twice.

## Maintenance notes

An external billing mutation is not complete until its local enforcement state
is either committed or durably marked for reconciliation.
