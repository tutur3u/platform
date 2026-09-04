# Plan 053: Await Public AI Generate Credit Settlement

> **Executor instructions:** Make metered public generation observe the resolved
> credit result before returning a normal success, without regenerating on a
> settlement retry.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ai/src/generate/route.ts packages/ai/src/credits/check-credits.ts packages/ai/src/generate`
> Stop if Plans 027 and 028 are not complete or this settlement flow changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Correctness / Billing integrity
- **Depends on:** Plan 028; operator disposition of duplicate non-null execution deductions
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route fires credit deduction from `onFinish`, catches only promise
rejection, and returns after streaming. `deductAiCredits` normally reports RPC
failure as a resolved `{ success: false }`, so provider usage can succeed while
the balance and ledger remain unchanged or serverless teardown cancels work.

## Current state

- The provider stream is fully consumed before the JSON response is assembled.
- Execution persistence is awaited inside `onFinish`, but credit deduction is
  not awaited and its semantic result is ignored.
- The deduction API already accepts an execution ID, which must remain the
  correlation key, but the ledger has no uniqueness constraint and the RPC
  unconditionally inserts a deduction.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Execute only after
Plans 027/028 have stabilized the same route, then refresh this plan's exact
error envelope and input-limit assumptions. Audit production-like data for
duplicate `transaction_type = 'deduction'` rows sharing a non-null
`execution_id`; obtain operator disposition before adding uniqueness.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Generate tests | `bun run --cwd packages/ai test -- src/generate/route.test.ts` | lifetime/result cases pass |
| AI typecheck | `bun --cwd packages/ai type-check` | exit 0 |
| Database apply | `bun sb:reset` | idempotency migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | replay/concurrency pgTAP cases pass |
| Generated types | `bun sb:typegen` | only schema-derived changes |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/ai/src/generate/route.ts`
- `packages/ai/src/generate/route.test.ts`
- One additive Supabase migration and focused pgTAP test making non-null
  execution deductions idempotent
- `apps/database/supabase/tests/ai-credit-deduction-idempotency.sql`
- Generated database types only through `bun sb:typegen`
- A narrowly shared settlement helper only if tests prove another existing
  public-generate entry point needs the identical contract

Do not refactor unrelated AI routes or alter credit prices.

## Git workflow

- Branch: `fix/public-generate-credit-settlement` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ai): await generate credit settlement`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Make deduction idempotent by execution

After the duplicate-data preflight is clean or explicitly remediated, add a
partial unique invariant for deduction transactions with a non-null execution
ID. Update `deduct_ai_credits` so replay returns the already-recorded outcome
without changing balances; serialize concurrent calls before balance mutation
and prove the loser cannot double-charge. Preserve behavior for legacy callers
without an execution ID.

### Step 2: Capture completion state explicitly

Make `onFinish` await both execution persistence and `deductAiCredits`. Store a
typed completion result that the outer request checks after stream consumption;
do not rely on `.catch` as the semantic failure path.

### Step 3: Fail closed without rerunning generation

When deduction resolves unsuccessful, emit structured server telemetry keyed by
execution/workspace, return the stable sanitized service-failure envelope, and
do not return a normal generated payload. Preserve the execution ID so an
operator or durable retry can settle the same usage without another provider
call. If no idempotent retry path exists, STOP and expand the design to a
durable settlement job before implementation.

### Step 4: Preserve successful accounting

Keep the existing token/cost calculation and exactly one deduction request.
Do not deduct on pre-provider validation failures or duplicate settlement calls.

## Test plan

Use deferred promises to prove the response cannot finish before settlement.
Cover successful deduction, resolved `{ success: false }`, rejected deduction,
execution persistence failure, and exactly-once execution ID propagation. In
pgTAP, cover sequential replay, concurrent replay, and null-execution legacy
behavior, proving one balance change and one ledger deduction.

## Done criteria

- [ ] Normal success cannot outrun credit settlement.
- [ ] Resolved failures are observed and reported safely.
- [ ] The database makes non-null execution deductions idempotent under replay and concurrency.
- [ ] Retry uses the original execution identity and never regenerates output.
- [ ] Focused tests, AI typecheck, repository gate, and whitespace pass.

## STOP conditions

Stop until duplicate historical deductions have an operator-approved
disposition. Also stop if returning a failure would make clients automatically
regenerate; design a durable outbox/retry contract first.

## Maintenance notes

Metered provider routes must treat resolved failure results as failures; promise
rejection handling alone is insufficient.
