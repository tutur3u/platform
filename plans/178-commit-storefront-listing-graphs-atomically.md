# Plan 178: Commit Storefront Listing Graphs Atomically

> **Executor instructions:** Replace the serial, partially committed listing
> graph rebuild with one workspace-scoped transaction and keep provider sync as
> post-commit intent. Preserve route envelopes and omitted-field semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- packages/inventory-core/src/lib/inventory/commerce/repository-listings.ts packages/inventory-core/src/lib/inventory/commerce/repository.test.ts packages/inventory-core/src/lib/inventory/commerce/schemas.ts 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/storefronts/[storefrontId]/listings' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / performance / database
- **Depends on:** Plans 154 and 163; Finance/Inventory application, migration,
  and generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Creating or editing a listing commits the parent row before rebuilding options
and variants through hundreds of serial database calls. A late validation or
insert failure returns 500 with a partial graph, retry can interleave with that
state, and the largest accepted payload can require more than 1,500 round trips
before provider scheduling.

## Current state

- Schemas allow 8 option groups with 64 values each and 200 variants.
- Option rebuilding deletes the full graph and serially inserts groups/values.
- Variant rebuilding performs repeated validation reads, per-variant writes,
  junction delete/inserts, and provider scheduling.
- Parent create/update is committed separately before the child graph.
- Focused repository coverage characterizes reads/delete but not create/update
  rollback, overlapping edits, or route failure envelopes.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain the canonical
Finance/Inventory transfer. Read the private-schema migrations, provider-sync
contract, route schemas, and root/database/Inventory AGENTS. Use completed Plan
151/163 tooling and a green Plan 154 base.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Repository tests | `bun run --cwd packages/inventory-core test -- src/lib/inventory/commerce/repository.test.ts src/lib/inventory/commerce/schemas.test.ts` | create/update/rollback/provider-intent cases pass |
| Route tests | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/inventory/storefronts/[storefrontId]/listings/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/storefronts/[storefrontId]/listings/[listingId]/route.test.ts'` | envelopes and no-partial-write cases pass |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/storefront-listing-graph.sql` | atomicity, containment, and concurrency pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/storefront-listing-graph.sql` | generated RPC types match the reviewed contract |
| Types/build | `bun run --cwd packages/inventory-core type-check && bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** private transactional RPC and pgTAP; repository create/update
orchestration and focused tests; listing POST/PATCH route tests; generated types;
post-commit Polar scheduling facts.

**Out of scope:** public storefront response redesign; checkout behavior;
provider API semantics; option/variant limits; bulk import; production apply;
unrelated Inventory migrations.

## Git workflow

Use `fix/atomic-storefront-listings` from the integrated database base and
commit `fix(inventory): commit listing graphs atomically`. Claim/release the
commit window; do not push or apply production migrations.

## Steps

1. Freeze create/PATCH semantics, especially omitted versus explicit-empty
   options/variants, option-template application, variant ids, target fields,
   current route errors, and post-commit provider scheduling/archive behavior.
2. Add a private, service-role-only transaction accepting the normalized graph.
   Lock the storefront and existing listing for updates; validate listing,
   product/bundle/unit/warehouse/stock coordinates, option template, variant
   ownership, duplicate names/labels, and all bounds inside the transaction.
3. Use set-based JSON record expansion with ordinality for option groups,
   values, variants, and junctions. Commit parent and children together. A late
   invalid junction or missing coordinate must leave the entire prior graph
   unchanged; create failure must leave no parent row.
4. Serialize edits to one listing. Define and test the exact overlap result:
   either the later locked transaction replaces the whole graph or a stable
   conflict is returned—never a mixed graph. Use two independent connections
   in pgTAP/dblink rather than a single-session simulation.
5. Return only committed ids and provider-sync/archive facts from the RPC.
   Schedule Polar work after commit; no external/provider effect may execute
   inside SQL. Preserve route success/error envelopes and revalidation.
6. Add repository/route failure and replay tests, focused/full disposable DB,
   isolated typegen, Inventory types/build, repository, and whitespace gates.

## Done criteria

- [ ] Listing parent/options/values/variants/junctions commit or roll back together.
- [ ] Large accepted graphs use bounded set-based database calls.
- [ ] Concurrent edits cannot produce a mixed graph.
- [ ] Provider scheduling occurs only from committed returned intent.
- [ ] Route envelopes and omitted/empty semantics remain compatible.
- [ ] All focused/full DB, typegen, app, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, ambiguous option-template or provider semantics,
inability to run a real two-connection assertion, red Plan 154 baseline,
unexpected type drift, default-stack mutation, or a mandatory gate failing
twice.
