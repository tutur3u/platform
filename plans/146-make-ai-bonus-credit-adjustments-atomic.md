# Plan 146: Make AI Bonus-Credit Adjustments Atomic

> **Executor instructions:** Replace the admin AI-credit bonus read/update/
> ledger sequence with one idempotent transactional adjustment.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/infrastructure/src/app/api/v1/admin/ai-credits/balances apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / financial-ledger
- **Depends on:** generated database type and migration ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The admin endpoint computes a new bonus from a stale read, writes the balance,
then ignores the separate transaction-insert result. Concurrent adjustments can
lose credits, an insert failure can leave the balance without its audit ledger,
and ambiguous client retries can double-grant credits.

## Current state

- `balances/route.ts:155-176` reads `bonus_credits`, adds the request amount in
  JavaScript, and writes the replacement value without a lock.
- `balances/route.ts:187-195` performs the ledger insert separately and never
  inspects its returned error before returning success.
- Existing deduction/settlement RPCs update balances and insert ledger rows in
  one database transaction, establishing the repository pattern.
- No route test covers the bonus mutation, overlap, retry, or ledger failure.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Do not begin until every active generated-type/migration
owner transfers the paths. Use an isolated worktree and `bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/infrastructure vitest run src/app/api/v1/admin/ai-credits/balances/route.test.ts` | auth, retry, and failure matrix passes |
| Focused DB | `bun --cwd apps/database scripts/run-supabase.js test db supabase/tests/admin-ai-credit-bonus-adjustment.sql` | atomic/idempotent/concurrent cases pass |
| Full DB | `bun --cwd apps/database scripts/run-supabase.js test db` | all pgTAP pass |
| Apply/typegen | `bun sb:up && bun sb:typegen` | migration applies; only intended RPC type changes |
| Typecheck/build | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** bonus POST route and a new test; one additive migration adding a
nullable `request_id uuid` ledger column, one partial unique index, and one
private/service-role-only RPC; pgTAP; generated DB types.

**Out of scope:** credit pricing, deductions/reservations, allocation UI,
negative adjustments, public RPC grants, or unrelated AI-credit schemas.

## Git workflow

After transfer use `fix/atomic-ai-bonus-credits` and commit
`fix(infrastructure): make bonus credits atomic`. Do not push or apply production
migrations.

## Steps

1. Require an `Idempotency-Key` header containing one UUID and keep `amount`
   bounded to the ledger's positive `NUMERIC(14,4)` domain (at most four decimal
   places and no value that would overflow the column). Add route tests proving
   unauthorized, malformed/missing key, invalid amount, missing balance,
   duplicate-key, conflict, concurrent, and database-failure behavior. Preserve
   the admin authorization boundary.
2. Add nullable `ai_credit_transactions.request_id uuid` and a partial unique
   index on `(balance_id, request_id)` for `transaction_type = 'bonus' AND
   request_id IS NOT NULL`. Existing rows remain null and require no backfill.
   Add `public.admin_add_ai_bonus_credits(p_balance_id uuid, p_amount
   numeric, p_reason text, p_request_id uuid)` as `SECURITY DEFINER` with a safe
   search path; revoke PUBLIC/anon/authenticated and grant only service_role.
3. In the RPC, lock the balance row, check the unique bonus request first, then
   increment `bonus_credits` and insert the matching ledger row in the same
   transaction. Persist the committed post-adjustment value as numeric JSON in
   immutable ledger metadata key `post_bonus_credits` alongside the normalized
   reason. A same-key retry with the same amount and reason returns that stored
   post-adjustment value and transaction id without reading a later current
   balance or incrementing; reuse with a different amount or reason raises a
   stable conflict condition. Distinct keys serialize and both apply. Fail the
   entire transaction on any ledger error.
4. Return the exact success envelope `{ success: true, bonusAdded, bonusCredits,
   transactionId }`; replay returns the same values. Map missing balance to 404,
   key-payload mismatch to 409, validation to 400, and all other database
   failures to a sanitized 500. Route POST only through the RPC and run all
   gates.

## Done criteria

- [ ] Balance and ledger commit together or neither changes.
- [ ] Concurrent distinct adjustments do not lose updates.
- [ ] Same-key retries never double-grant credits.
- [ ] Replay after an intervening distinct adjustment returns the original stored result.
- [ ] Same-key payload mismatches return 409 without disclosing the prior grant.
- [ ] Ordinary database callers cannot invoke or spoof the admin RPC.
- [ ] Route, pgTAP, typegen, build, repository, and whitespace gates pass.

## STOP conditions

Stop until ownership transfers; also stop if the current ledger cannot carry a
stable unique idempotency key without a schema decision, existing bonus rows
violate the chosen invariant, typegen drifts broadly, or a gate fails twice.
