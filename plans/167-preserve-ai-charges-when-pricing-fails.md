# Plan 167: Preserve AI Usage Charges When Pricing Is Unavailable

> **Executor instructions:** A successful provider execution must never become
> terminal zero-cost usage merely because the pricing lookup failed. Persist
> the measured usage as a durable pending-pricing record, retain any credit
> reservation, and reconcile pricing and settlement idempotently.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/ai/src/lib/public-api.ts apps/ai/src/lib/public-api.test.ts apps/ai/src/app/api/cron/reconcile-pricing apps/ai/vercel.json packages/ai/src/studio/metering.ts packages/ai/src/studio/metering.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / billing / durable reconciliation
- **Depends on:** Plan 154, Plan 163, CS35 gateway/external-AI ownership, and
  database/generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  163 commit `3f61e928ea` after Plan 154 is DONE

## Why this matters

Every metered AI modality currently translates a pricing RPC failure into zero
credits and zero provider cost, then terminally settles the run. For an
ordinary API key this refunds the full reservation, skips the deduction
ledger, and records the successful provider call as free. Pricing availability
must not decide whether already-consumed provider work is charged or observed.

## Current state

- `apps/ai/src/lib/public-api.ts:258-266` catches every
  `calculateAiStudioUsageCost` failure and substitutes
  `{ billedCredits: 0, providerCostUsd: 0 }` before calling the terminal
  settlement functions. `recordMeteredExecutionStep` repeats the zero fallback.
- `packages/ai/src/studio/metering.ts:86-110` intentionally throws when the
  service-role pricing RPC errors or returns no row; this is an unavailable
  pricing decision, not proof of zero usage.
- `private.settle_ai_studio_run` accepts zero actual credits. The migration at
  `20260727081221_ai_studio_metering.sql:399-469` refunds the reservation,
  omits the deduction transaction, marks the run complete, records zero usage,
  and increments the API-key counter by zero.
- Text, embedding, image, and speech execution all call the shared settlement
  helper. Non-streaming text awaits it after provider success; streamed paths
  also settle through the same boundary.
- Run status currently permits only `reserved`, `running`, `succeeded`,
  `failed`, and `aborted`. Retention cleanup expires reservations for only
  `reserved`/`running`; there is no durable pricing-reconciliation state or
  worker.

## Exact lifecycle contract

- Add a durable run state `pricing_pending`. Enter it only after provider work
  has produced measured usage and pricing could not be resolved. Persist the
  intended terminal status, usage counters, latency, sanitized error metadata,
  and a bounded retry schedule in first-class columns or one strictly validated
  JSON object. Do not write `completed_at`, `private.ai_studio_usage`, a
  deduction transaction, or terminal billed/provider-cost values yet.
- For metered keys, the existing reservation remains `reserved` and continues
  to count against the balance and key's `credits_reserved`. Pricing-pending
  reservations must not be expired/refunded by generic retention cleanup.
- For external-app runs without a reservation, still retain pricing-pending
  usage so provider-cost observability is reconciled rather than recorded as
  zero.
- Add private SECURITY DEFINER claim/retry RPCs with fixed search paths and
  service-role-only grants. Claim at most 50 due rows with `FOR UPDATE SKIP
  LOCKED`, a five-minute lease, and an idempotent run ID. Re-delivery after a
  worker crash must converge through the existing run settlement idempotency.
- Retry pricing after 1, 5, and 30 minutes, then daily without releasing the
  reservation. There is no terminal “free” or automatic refund state. Expose
  exhausted/repeated failures in structured server logs for operator action.
- The exact cron route is
  `GET /api/cron/reconcile-pricing` at
  `apps/ai/src/app/api/cron/reconcile-pricing/route.ts`. Require
  `Authorization: Bearer ${CRON_SECRET}` with constant-time comparison and fail
  closed when the secret is absent. `apps/ai/vercel.json` schedules it every
  five minutes. Response is
  `{ claimed, settled, deferred, failed }`, contains no run content, actor IDs,
  pricing internals, or raw errors, and is `Cache-Control: private, no-store`.
- A provider-success response may return after the pending record is durable;
  it must not rerun the provider just because immediate pricing was unavailable.
  If persisting the pending state itself fails, return a sanitized 500 because
  neither terminal settlement nor durable reconciliation is proven.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain exact transfer from
`20260805-113000-claude-cs35-gateway-machine-credential.md` for
`apps/ai/src/lib/public-api.ts` and the metering boundary, plus database and
generated-type transfers. Confirm Plan 154 is DONE and start from Plan 163 so
focused/full pgTAP and isolated typegen are available.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| AI settlement | `bun --cwd apps/ai vitest run src/lib/public-api.test.ts 'src/app/api/cron/reconcile-pricing/route.test.ts'` | pricing failure, durable pending, worker auth/retry, and terminal settlement cases pass |
| Shared metering | `bun --cwd packages/ai vitest run src/studio/metering.test.ts` | claim/defer/settle helper cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-studio-pricing-reconciliation.sql` | pending/claim/replay/accounting assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-studio-pricing-reconciliation.sql` | focused test passes and generated types update only for this migration |
| Typechecks | `bun run --cwd apps/ai type-check && bun run --cwd packages/ai type-check` | exit 0 |
| AI build | `bun run --cwd apps/ai build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the two AI metering modules and focused tests; the exact AI cron
route/test and its five-minute Vercel schedule; one additive migration for the
pending state plus service-role claim/defer RPCs; one focused pgTAP file; and
generated types.

**Out of scope:** pricing formulas/rates, reservation sizing, model admission,
provider retries, changing API response payloads, retroactively estimating old
zero-cost runs, production migration application, or exposing reconciliation
details to public callers.

## Git workflow

Use branch `fix/reconcile-ai-pricing-failures` and commit
`fix(ai): reconcile pricing before settlement`. Work in an isolated worktree,
run `bun setup` immediately, claim/release the commit window, and do not push or
apply production migrations.

## Steps

1. **Freeze the failure.** Extend `public-api.test.ts` so a successful metered
   run with a rejected pricing lookup does not call either terminal settlement
   with zero. Cover metered API keys, unmetered external apps, text streaming,
   and one non-text modality through their shared helper. Add a step-metering
   assertion that pricing failure is not represented as successfully priced
   zero-cost work.

   **Verify:** the focused AI test fails only on the current zero fallback.

2. **Add the pending database lifecycle.** Add `pricing_pending` and the exact
   persisted usage/retry fields. Implement a service-role-only defer RPC that
   locks the run/reservation, stores measured usage and intended terminal
   status once, and leaves balance/key reservations intact. Update retention so
   it never refunds a pending run. Implement bounded lease claims and retry
   settlement that delegates to one idempotent terminal path.

   **Verify:** focused pgTAP proves no refund/deduction/usage row on defer,
   metered and external-app handling, two-worker claim exclusion, expired-lease
   reclaim, exact terminal accounting, duplicate settlement, and cleanup not
   touching pending reservations.

3. **Remove the zero fallback.** On pricing failure, call the defer helper with
   the measured usage and return only after it is durable. Keep genuine
   zero-usage provider failures settleable when pricing successfully returns
   zero. For step records, do not label a failed pricing decision as priced
   zero; log a stable code and make the run-level pending state authoritative.

   **Verify:** AI and shared-metering focused tests pass and
   `rg -n 'calculateAiStudioUsageCost[\\s\\S]{0,240}billedCredits: 0' apps/ai/src/lib/public-api.ts`
   returns no fallback match.

4. **Add bounded reconciliation.** Implement the exact authenticated cron
   route and helpers. Each claimed run recalculates from persisted usage and
   invokes terminal settlement. Documented pricing unavailability schedules
   the next attempt; database/settlement ambiguity releases only the lease and
   remains pending. Never dispatch provider work from this worker.

   **Verify:** route tests cover absent/wrong secret, empty queue, mixed
   success/failure, duplicate delivery, worker crash/lease expiry, bounded 50
   claims, sanitized response/logging, and no provider invocation.

5. **Run all gates.** Run focused/full isolated database validation and
   typegen, typechecks, AI build, `bun check`, and whitespace verification.

## Done criteria

- [ ] Pricing failure can never terminally settle provider work at zero cost.
- [ ] Measured usage and intended terminal state are durable before a
      provider-success response returns.
- [ ] Metered reservations remain held and external-app provider cost remains
      pending until exact pricing succeeds.
- [ ] Bounded idempotent reconciliation converges without redispatching model
      work or double charging.
- [ ] Focused/full database, app/package, build, repository, and whitespace
      gates pass with reviewed generated-type drift only.

## STOP conditions

Stop on missing ownership transfer, Plan 154 not DONE, inability to distinguish
provider completion from pre-provider failure, any path that refunds a pending
reservation, need to guess a price, inability to keep public success responses
compatible, default-stack mutation, unexpected generated-type drift, or a gate
failing twice.

## Maintenance notes

Zero actual usage remains valid only when pricing successfully returns zero.
Operational cleanup must never convert an unresolved pricing decision into a
free terminal run; operators need visibility until reconciliation succeeds.
