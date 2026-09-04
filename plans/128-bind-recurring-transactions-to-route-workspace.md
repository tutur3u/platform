# Plan 128: Bind Recurring Transactions to Wallets and Categories in the Route Workspace

> **Executor instructions:** Prevent Finance recurring rows from referencing a
> wallet or category owned by another workspace. Enforce the tenant invariant at
> both the HTTP boundary and the database boundary; do not rely on RLS because
> Finance app-session requests use a service-role-backed client.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/recurring-transactions/route.ts' 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/recurring-transactions/[recurringTransactionId]/route.ts' 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/recurring-transactions/upcoming/route.ts' packages/finance-core/src/route-auth.ts packages/auth/src/app-session.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Quote every bracketed path. Stop on route, schema, generated-type, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / data integrity
- **Depends on:** Finance/Inventory application ownership and generated migration/type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

POST and PUT accept caller-selected wallet/category UUIDs and persist them with
the route workspace without proving co-tenancy. Finance app-session requests
query through a service-role client, so RLS does not repair the missing check.
This permits internally inconsistent cross-tenant recurring rows; current
upcoming reads can misattribute joined metadata, and any later materialization
would post against the referenced wallet.

## Current state

- Collection POST validates only string shape, then spreads `wallet_id` and
  `category_id` into `recurring_transactions` with `ws_id` at
  `.../recurring-transactions/route.ts:6-15,72-86`.
- Item PUT replaces both foreign IDs while constraining only the recurring row
  by route workspace and id at `[recurringTransactionId]/route.ts:38-52`.
- `20251005000003_add_recurring_transactions.sql:21-24,42-73` has independent
  foreign keys and policies over the recurring row's `ws_id`, but no co-tenant
  wallet/category invariant.
- `packages/finance-core/src/route-auth.ts:21-32` supplies app-session handlers
  with an admin client; `attachSupabaseAuthUser` changes auth methods, not the
  service-role query credential (`packages/auth/src/app-session.ts:717-742`).
- The historical processor copies the stored wallet/category IDs into a wallet
  transaction at migration lines 97-147. Repository search currently finds no
  scheduler/caller, so characterize it but do not claim it is live.
- Active `20260709-123138-claude-finance-inventory-migration.md` is `working`
  and claims all Finance sources. Do not begin without exact transfer.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Recheck active Finance, database-migration, and
generated-type owners. Use `bun sb:new enforce_recurring_transaction_tenant_references`;
never hand-author a migration filename and never run a production push.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Finance routes | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/recurring-transactions/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/finance/recurring-transactions/[recurringTransactionId]/route.test.ts'` | self-workspace succeeds; cross-workspace references return 400 before mutation |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | new pgTAP file passes with the full suite |
| Local apply | `bun sb:up && bun sb:typegen` | migration applies; generated type diff is expected only if schema shape requires it |
| Finance typecheck | `bun run --cwd apps/finance type-check` | exit 0 |
| Finance build | `bun run --cwd apps/finance build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the two recurring mutation routes and colocated tests; one
uniquely named additive migration and pgTAP test; generated Supabase types only
when typegen changes them; `plans/README.md` for status.

**Out of scope:** frequency/date algorithms, activating or redesigning the
dormant processor, response-copy/UI work, unrelated Finance routes, Rust
cutover, production migration application, and unrelated generated-type churn.

**Read-only drift evidence:** upcoming route, Finance auth helpers, historical
recurring migration, and active coordination notes.

## Git workflow

Use isolated branch `fix/finance-recurring-tenant-references`, run `bun setup`,
and commit `fix(finance): bind recurring references to workspace`. Claim and
release the commit window; do not push unless instructed.

## Steps

### Step 1: Characterize the route boundary

Create focused POST/PUT tests using app-session-shaped service-role mocks. Cover
same-workspace wallet/category, nullable category, foreign wallet, foreign
category, missing IDs, permission denial, and no admin mutation after denial.

**Verify:** run the focused Finance command above. Expected before the fix: the
foreign-reference cases fail for the intended reason; after the fix all pass.

### Step 2: Reject foreign references before mutation

After permission and schema validation, query wallet and optional category by
both id and `normalizedWsId`. For either a missing or foreign reference return
exactly `{ message: 'Invalid wallet or category' }` with status 400, without
revealing which UUID exists elsewhere. Share a small Finance-local helper only
if it keeps both routes below the source-size ceiling.

**Verify:** focused route tests pass and assert the insert/update is never
invoked for either foreign reference.

### Step 3: Add a rollout-safe database invariant

First add an exact audit query/test for rows whose wallet or category workspace
differs; expected result is zero locally and must also be run by the production
operator before validation. Add unique `(id, ws_id)` candidate keys where
needed and composite recurring-to-wallet/category foreign keys. Use `NOT VALID`
for existing-row rollout safety if production cleanliness is not yet proven,
while ensuring new writes are enforced immediately; document the later
validation command. Preserve current delete behavior exactly: deleting a wallet
still cascades its recurring rows, while deleting a category sets only
`category_id` to null and leaves the recurring row's non-null `ws_id` unchanged.
Use the PostgreSQL column-list action
`ON DELETE SET NULL (category_id)` on the composite category key; do not use a
plain composite `SET NULL` that also targets `ws_id`. Do not delete or silently
rewrite mismatched financial rows.

**Verify:** pgTAP proves same-workspace inserts succeed, cross-workspace direct
inserts/updates fail, nullable category succeeds, and constraint/catalog state
matches the chosen validated or `NOT VALID` rollout contract. It also deletes a
same-workspace category and proves the recurring row remains with unchanged
`ws_id` and null `category_id`.

### Step 4: Apply and run all gates

Apply locally, regenerate types, run focused/full database gates, Finance
typecheck/build, `bun check`, and whitespace. Inspect generated types and retain
only deterministic in-scope changes.

## Done criteria

- [ ] POST/PUT cannot persist a wallet or category outside the route workspace.
- [ ] Direct database writes enforce the same invariant for new rows.
- [ ] Existing mismatches are audited and never silently reassigned or deleted.
- [ ] Wallet cascade and category-null-on-delete behavior remain unchanged.
- [ ] App-session, cookie, nullable-category, and foreign-reference tests pass.
- [ ] Database, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred, wallet/category tables lack a reliable
workspace key, the production duplicate/mismatch audit is nonzero without an
operator disposition, a composite constraint requires destructive cleanup, the
local Supabase state cannot apply the migration, or any gate fails twice.

## Maintenance notes

Keep tenant integrity database-enforced even when routes validate first. If the
processor is activated later, give it separate claim/idempotency/concurrency
review rather than expanding this authorization plan.
