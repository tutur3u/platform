# Plan 207: Restrict AI Credit Ledger RPCs to Trusted Server Callers

> **Executor instructions:** Execute from the combined Plan 154/163 database
> base, inventory the live overloads and callers first, then remove public Data
> API execution from the four AI-credit ledger/usage functions without changing
> their supported admin results.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests apps/infrastructure/src/app/api/v1/admin/ai-credits apps/backend/src/admin_ai_credits_entity_detail.rs apps/backend/src/admin_ai_credits_overview.rs apps/backend/src/admin_ai_credits_transactions.rs packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / database / tenant confidentiality
- **Depends on:** Plans 154 and 163; database/generated-type transfer and AI
  metering-owner review
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

Four `SECURITY DEFINER` functions expose platform-wide or caller-selected AI
credit transactions, monetary cost, identities, balances, usage, and allocation
totals without checking an actor. The supported Infrastructure and prepared
Rust admin routes use service-role clients, but public function execution has
not been revoked. One function also creates a missing balance and releases
expired reservations for caller-selected identifiers.

## Current state and exact contract

- `admin_list_ai_credit_transactions` is last defined in
  `20260225000000_add_search_pricing_support.sql:223-305`; it accepts arbitrary
  filters and exposes transaction metadata, costs, workspace/user identity, and
  tier data.
- `admin_get_ai_credit_entity_detail` is defined in
  `20260214140000_fix_cost_and_admin_rpcs.sql:199-310`; it accepts either a
  workspace or user id and returns identity, balance, feature/model usage, and
  daily trends.
- `get_platform_ai_credit_overview` is last defined in
  `20260214130000_revise_ai_credit_allocation.sql:589-647`; it returns global
  totals and top workspace/user consumers.
- `get_ai_credit_usage_summary` is last defined in
  `20260227185000_add_ai_credit_reservations.sql:735-824`; it accepts an
  arbitrary target and can create a balance and release expired reservations.
- Repository-wide caller inventory currently finds only the three admin RPCs
  in Infrastructure and prepared Rust, all using service-role credentials. It
  finds no supported caller for `get_ai_credit_usage_summary`.
- Preserve every current signature and JSON/table result. Revoke exact-signature
  execution from `PUBLIC`, `anon`, and `authenticated`, grant only
  `service_role`, and set an approved fixed search path on every definer body.
  Do not add an actor-selectable browser/session wrapper.
- If a supported non-service-role caller is discovered, STOP. Do not silently
  break it or broaden the ACL; return for a separate actor-bound design.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read the database and
backend AGENTS files. Start from the eventual green Plan 154 result with
completed Plan 163 incorporated, create an isolated worktree, and run
`bun setup` immediately. Obtain the database/type transfer and review the
active AI metering note before writing a migration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'admin_list_ai_credit_transactions|admin_get_ai_credit_entity_detail|get_platform_ai_credit_overview|get_ai_credit_usage_summary' --glob '!apps/database/supabase/migrations/**' --glob '!packages/types/src/supabase.ts' --glob '!plans/**' --glob '!tmp/agent-coordination/**' .` | only classified trusted server callers; no browser/session caller |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-credit-ledger-rpc-access.sql` | exact ACL, denial, service-role result, and side-effect assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-credit-ledger-rpc-access.sql` | generated signatures remain valid |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no output unless an intentionally reviewed type change was required |
| Infrastructure | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | admin callers compile and production build exits 0 |
| Backend | `bun check:backend` | prepared Rust service-role callers remain green |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive ACL/search-path migration; new
`apps/database/supabase/tests/ai-credit-ledger-rpc-access.sql`; generated types
only if the canonical tool produces necessary changes; narrow Infrastructure or
Rust characterization tests only if caller behavior is not already observable.

**Read-only evidence:** the historical function definitions and current
Infrastructure/Rust callers. **Out of scope:** changing credit arithmetic,
pricing, reservation semantics, admin UI response shapes, tenant self-service
analytics, production apply, or combining this with Plan 177's six execution-
analytics overloads.

## Steps

1. On a fresh disposable database, enumerate every exact `pg_proc` identity,
   owner, `proconfig`, and ACL for the four names. Complete the caller inventory
   before editing. Verify with the caller-inventory command above.
2. Create an additive migration that fixes search paths, revokes each exact
   signature from `PUBLIC`, `anon`, and `authenticated`, and grants it only to
   `service_role`. Do not change arguments or calculations. Verify the migration
   applies in the focused disposable gate.
3. Add pgTAP cases proving anonymous and ordinary authenticated roles cannot
   execute any function, including their own and foreign targets; service role
   receives seeded current results; and denied calls cannot create balances or
   release reservations. Assert exact function-level privileges.
4. Run focused/full isolated database validation before type generation, then
   typegen/no-diff, Infrastructure, backend, repository, and whitespace gates.

## Done criteria

- [ ] The four exact current functions have fixed search paths and service-role-
  only execution.
- [ ] Public, anonymous, and authenticated calls cannot read another tenant or
  trigger balance/reservation writes.
- [ ] Supported Infrastructure and Rust admin results are unchanged.
- [ ] Focused/full database, typegen, app/backend, repository, and whitespace
  gates pass.

## STOP conditions

Stop on a supported non-service-role caller, ambiguous overload identity,
result or arithmetic drift, red Plan 154 baseline, default-stack mutation,
secret-bearing output, an ownership conflict, or any mandatory gate failing
twice.
