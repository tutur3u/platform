# Plan 187: Restrict Finance Migration-Helper RPCs

> **Executor instructions:** Preserve the dev migration routes while removing
> direct authenticated access to three cross-tenant Finance definer readers.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/infrastructure/src/app/api/v1/infrastructure/migrate apps/web/src/legacy-api-routes/v2/workspaces tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** security / tenant privacy / migration
- **Depends on:** Plan 154 (BLOCKED); Finance/Inventory database ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Three `SECURITY DEFINER` migration helpers accept any workspace UUID, skip
actor authorization, and return invoice groups, promotions, products, prices,
warehouses, and counts. All authenticated database clients can execute them,
although the maintained migration routes invoke them through admin clients.

## Current state

- `20260130132858_add_migration_helper_rpcs.sql:13-169` creates/grants all
  three functions without actor checks.
- Promotions/products are redefined later; the latest product projection is in
  `20260717160000_inventory_cent_level_prices.sql:278-337`. No later migration
  removes authenticated execution.
- Runtime callers are limited to dev-mode Infrastructure migration routes and
  the live API-key-authenticated legacy v2 SDK migration route; all use admin
  clients after their own route-level authorization/workspace binding.
- Plan 170 covers separate email-bearing creator RPCs and does not include
  these maintained migration helpers.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database and
Finance/Inventory AGENTS. Inventory all latest overloads and prove every
supported caller uses the service role before changing ACLs.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/finance-migration-helper-privileges.sql` | all three ACL/projection matrices pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Types | `git diff --exit-code -- packages/types/src/supabase.ts` | signatures unchanged |
| Infrastructure | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive ACL/comment migration;
`finance-migration-helper-privileges.sql`; migration routes/generated types as
read-only evidence.

**Out of scope:** migration route behavior/availability; projection/signature
changes; retiring the legacy v2 route; production data migration/apply.

## Git workflow

Use `fix/restrict-finance-migration-rpcs` and commit
`fix(finance): restrict migration helper RPCs`. Claim/release the commit window;
do not push or apply production migrations.

## Steps

1. Catalog the latest exact signatures, grants, and every caller. Confirm each
   supported route uses an admin/service client. Preserve the Infrastructure
   dev gates and characterize the live v2 route's API-key/workspace binding;
   do not require that SDK route to become development-only.
2. Add one migration that revokes all execution on all three signatures from
   `PUBLIC`, `anon`, and `authenticated`, grants service role only, and adds
   comments naming the trusted migration boundary. Do not redefine bodies.
3. Add two-workspace pgTAP fixtures proving public/authenticated denial and
   service-role projection/count fidelity for groups, promotions, and products.
4. Run focused/full DB, no-type-drift, Infrastructure, repository, and
   whitespace gates.

## Done criteria

- [ ] Public/authenticated clients cannot query any migration helper.
- [ ] Existing admin-backed migration routes and exact projections still work.
- [ ] Function signatures and generated types do not change.
- [ ] Focused/full DB, app, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a supported caller-session client, a later unknown
overload, route/projection changes, type drift, red Plan 154, or a mandatory
gate failing twice.
