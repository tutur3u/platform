# Plan 184: Restrict Direct Transaction-Category Mutations

> **Executor instructions:** Preserve authorized category reads and maintained
> Finance routes while preventing ordinary members from bypassing granular
> create/update/delete permissions through the Data API.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/apis/src/finance/transactions/categories packages/ai/src/tools/executors/finance.ts packages/inventory-core/src apps/finance/src apps/inventory/src packages/ui/src/components/ui/finance apps/backend/src apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); Finance/Inventory and database/type transfer; backend/G22 contract review
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The active category policy grants ALL operations to every workspace member,
while maintained routes require `create_transactions`, `update_transactions`,
or `delete_transactions`. A direct delete can also cascade through
`wallet_transactions.category_id`, turning the permission bypass into
destructive financial-history loss.

## Current state

- `20260701070408_wrap_rls_perf_initplan.sql:653-655` leaves the
  `Enable all access for organization members` ALL policy active.
- `packages/apis/src/finance/transactions/categories/**` uses admin persistence
  only after granular Finance permission checks.
- The category foreign key on wallet transactions uses `ON DELETE CASCADE`.
- Multiple Finance/Inventory/AI callers query categories; their client roles
  and legitimate mutation paths must be classified before ACL changes.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database and
Finance/Inventory/backend AGENTS. Resolve the canonically working
Finance/Inventory note and generated-type ownership; coordinate a read-only
contract review with backend/G22. Inventory all direct table clients, including
the caller-token Infrastructure category export.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/transaction-category-permissions.sql` | CRUD/cascade matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/transaction-category-permissions.sql` | no schema-shape drift |
| APIs | `bun run --cwd packages/apis type-check` | exit 0 |
| Finance | `bun run --cwd apps/finance type-check` | exit 0 |
| Inventory | `bun run --cwd apps/inventory type-check` | exit 0 |
| Backend | `bun check:backend` | caller-token category export tests and full backend checks pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive policy/grant migration;
`transaction-category-permissions.sql`; generated types only if unavoidable;
focused route tests only when caller characterization needs them.

**Out of scope:** category response/UI changes; changing the existing foreign
key cascade; transaction/tag atomicity; moving tables private; production apply.

## Git workflow

Use `fix/restrict-transaction-categories` and commit
`fix(finance): authorize transaction categories`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Catalog every category table caller and classify its client role and
   operation. Prove maintained mutations flow through granular permission-
   checked admin/server boundaries; stop on a supported direct session mutation.
2. Replace the member-wide ALL policy with separate SELECT and mutation
   policies. Preserve legitimate member/category reads established in Step 1.
   Require the matching granular create/update/delete permission for direct
   writes, or revoke authenticated mutations entirely when all supported writes
   are trusted server-side. UPDATE must validate old and new workspace.
3. Preserve service-role/admin behavior used by Finance, Inventory, and AI.
   Do not weaken `ON DELETE CASCADE`; instead prove unauthorized category
   deletion cannot reach it.
4. Add pgTAP cases for anonymous, ordinary member read, ordinary member denied
   create/update/delete, each granular manager, cross-workspace moves, trusted
   service role, and denied-delete preservation of the linked transaction.
5. Run focused/full DB, typegen, APIs/Finance/Inventory typechecks, backend,
   repository, and whitespace gates.

## Done criteria

- [ ] Workspace membership alone cannot mutate transaction categories.
- [ ] Maintained granular route behavior and legitimate reads remain intact.
- [ ] Unauthorized delete cannot cascade into wallet transactions.
- [ ] Focused/full DB, typegen, package/app, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a supported direct session mutation, inability to map
an operation to the canonical Finance permission, existing cross-workspace
category references, unexpected typegen drift, a red Plan 154 baseline, or a
gate failing twice.
