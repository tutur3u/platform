# Plan 289: Bind Finance Budgets and Spent Totals to One Workspace

> **Executor instructions:** Repair both tenant boundaries together: budget
> wallet/category references and transaction-triggered `spent` recomputation.
> Audit existing data before adding constraints; never silently delete, null, or
> reinterpret a mismatched reference.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/budgets' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the canonically working Finance/Inventory
  handoff owns `apps/finance/src/**`, and database/generated-type ownership has
  not transferred
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / correctness / tenant integrity
- **Depends on:** Plans 154 and 163; Finance and database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The privileged budget routes accept wallet and category UUIDs without proving
they belong to the authorized workspace. More critically, the database trigger
that maintains `spent` sums transactions without a workspace predicate, so a
normal transaction change can overwrite a general budget with expenses from
other tenants. This corrupts budget alerts and exposes cross-tenant aggregate
financial activity through an otherwise workspace-scoped API.

## Current state and exact contract

- `apps/finance/src/app/api/v1/workspaces/[wsId]/finance/budgets/shared.ts`
  validates UUID shape and copies `category_id`/`wallet_id` into an admin-client
  payload, but does not resolve either reference in the normalized workspace.
- Collection POST and item PATCH persist that payload through `sbAdmin`. Preserve
  their current authorization, successful JSON shapes, and sanitized database
  errors. A non-null missing or foreign reference must return the same
  non-disclosing `{ message: 'Invalid budget reference' }`, status 400, before
  any mutation.
- `20251005000001_add_finance_budgets.sql` gives `finance_budgets.ws_id`,
  `category_id`, and `wallet_id` independent foreign keys. Add parent uniqueness
  on `(id, ws_id)`, then replace the two single-column budget FKs with composite
  `(category_id, ws_id) -> transaction_categories(id, ws_id)` and
  `(wallet_id, ws_id) -> workspace_wallets(id, ws_id)`. Preserve the existing
  delete behavior and nullable references. Assert the legacy FK names are gone,
  not merely supplemented by redundant constraints.
- The same migration's `update_budget_spent()` joins a null-wallet budget to a
  wallet in the changed transaction's workspace but never filters the budget's
  workspace, and its SUM has no workspace filter. Replace it with a focused
  recomputation helper whose input is one canonical workspace UUID. Every SUM
  must join transactions to `workspace_wallets`, require the joined wallet and
  budget to equal that UUID, and then apply the budget's date/category/wallet
  predicates. General budgets (`wallet_id` and/or `category_id` null) remain
  workspace-wide, never global.
- INSERT and DELETE recompute the affected wallet workspace. UPDATE recomputes
  both old and new wallet workspaces when they differ, so moving a transaction
  cannot leave stale totals. Unknown wallet references must fail closed rather
  than trigger a global recompute.
- Before constraint replacement, run a read-only two-reference mismatch audit.
  STOP and report exact counts/IDs if any mismatches exist; their disposition is
  an operator decision. After the constraints are safe, recompute every budget
  from canonical transaction data in the migration so previously corrupted
  `spent` values are repaired deterministically.
- Keep `public.update_budget_spent()` as the zero-argument trigger entrypoint and
  add `private.recompute_finance_budget_spent(p_ws_id uuid)` as its focused
  helper. Both remain owned by the migration owner with fixed search paths.
  Make the public trigger entrypoint `SECURITY DEFINER`; it uses only fully
  qualified relations/functions and calls the private helper as the migration
  owner. Keep the helper non-public and owner-executable. This lets ordinary
  authenticated/service-role transaction DML fire the trigger without granting
  either role direct function execution.
  They are trigger-internal, not product RPCs: revoke their exact signatures
  from PUBLIC, anon, authenticated, and service_role, and make no direct EXECUTE
  grant. PostgreSQL invokes the trigger entrypoint through the installed table
  trigger; no HTTP/service-role caller may invoke either function directly.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 isolated-validator base
only after Plan 154 is green. Obtain exact transfer from
`tmp/agent-coordination/20260709-123138-claude-finance-inventory-migration.md`
and the current database/generated-type owners.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/budgets/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/finance/budgets/[budgetId]/route.test.ts'` | valid/null references and missing/foreign reference denials pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/finance-budget-tenant-integrity.test.sql --typegen packages/types/src/supabase.ts` | constraints, trigger operations, tenant isolation, recompute, and ACL tests pass |
| Full database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full reset/pgTAP and typegen pass |
| Deterministic types | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | a second type generation is byte-identical to the intentional generated diff |
| Finance app | `bun run --cwd apps/finance type-check && bun run --cwd apps/finance build` | Finance compiles and builds |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |

## Scope

**In scope:** the budget shared helper, collection/item routes, two focused route
tests created beside them, one additive migration, one focused pgTAP file, and
generated Supabase types.

**Out of scope:** budget UI redesign; changing budget periods or alert math;
transaction creation/import behavior; deleting or auto-repairing mismatched
references without operator approval; Finance/Rust traffic migration; unrelated
wallet/category policies.

## Steps

1. Add red route tests for valid same-workspace, null, missing, and foreign
   wallet/category references on POST and PATCH. Resolve both optional
   references with `id` plus canonical `ws_id` before mutation and return the
   exact 400 envelope above for every miss.
2. Add a read-only mismatch query to the migration preflight and pgTAP fixture.
   Add `(id, ws_id)` parent uniqueness, drop the exact legacy budget reference
   FKs, and add the composite replacements in dependency-safe order.
3. Replace the trigger function with a workspace-derived recompute boundary.
   Cover INSERT, DELETE, same-workspace UPDATE, and cross-workspace wallet UPDATE;
   ensure both old and new workspaces settle. Recompute all existing budgets
   after the new function/constraints are installed.
4. Add two-workspace pgTAP fixtures with general, wallet-only, category-only,
   and combined budgets. Prove transactions in workspace B never affect A,
   direct foreign references fail, null filters remain valid, legacy constraints
   are absent, and PUBLIC/anon/authenticated/service_role all lack direct
   EXECUTE on both exact trigger-internal signatures. Exercise authenticated and
   service-role transaction DML to prove the SECURITY DEFINER trigger still
   settles the expected workspace despite direct-call denial.
5. Run focused/full database validation, deterministic typegen, route tests,
   Finance typecheck/build, `bun check`, whitespace, and exact-scope review.

## Done criteria

- [ ] Routes reject every non-null wallet/category outside the normalized route workspace before writing.
- [ ] PostgreSQL independently rejects cross-workspace budget references and retains no redundant legacy FK.
- [ ] Every budget sum is restricted to its own workspace for all null/non-null filter combinations.
- [ ] INSERT/UPDATE/DELETE, including a wallet move, recompute every affected workspace exactly.
- [ ] Existing valid budgets are recomputed; mismatched historical references are never silently changed.
- [ ] Both trigger-internal functions have fixed search paths and no direct EXECUTE grant to PUBLIC, anon, authenticated, or service_role.
- [ ] The migration-owner SECURITY DEFINER trigger succeeds for authorized authenticated and service-role transaction DML despite those direct-call revokes.
- [ ] Focused/full DB, deterministic types, routes, build, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on any existing mismatched wallet/category reference; an unsupported direct
caller of the old recompute function; inability to identify both workspaces for
an UPDATE; a parent-key or delete-semantics conflict; Finance/database/type
ownership drift; a red exact-base isolated database baseline; or any mandatory
gate failing twice.

## Maintenance notes

Any future budget dimension must be tenant-bound both in route validation and
in PostgreSQL. A service-role route predicate is not a substitute for a
composite database invariant, and a general budget means all matching expenses
inside one workspace only.
