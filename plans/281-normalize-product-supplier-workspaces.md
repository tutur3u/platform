# Plan 281: Normalize Product-Supplier Workspace Aliases

> **Executor instructions:** Resolve the route workspace once through the
> request-aware canonical workspace resolver, then use that UUID for supplier
> authorization and every service-role query/mutation. Preserve UUID contracts.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-categories/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-warehouses/route.ts' apps/inventory/src/lib/api-auth.ts apps/inventory/src/__tests__/product-supplier-workspace-aliases.test.ts apps/backend/src/workspaces_product_suppliers.rs packages/utils/src/workspace-helper.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the active Finance/Inventory handoff owns the
  Inventory routes; coordinate backend parity and Plans 258/275
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** correctness / workspace aliases / TypeScript-Rust parity
- **Depends on:** exact-path Inventory transfer; land with or after Plans
  258/275 so their adjacent supplier edits are not overwritten
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

`getPermissions` internally authorizes the normalized workspace but returns no
canonical ID. The compatibility supplier handlers subsequently query or mutate
with the raw route string. A valid `personal` or handle request can pass access
checks yet query a non-UUID, fail an insert, or return a false-success item
mutation. The prepared Rust GET already uses the canonical authorization UUID.

## Current state and exact contract

- The collection and item handlers pass raw `wsId` to `getPermissions`, then
  use that same raw string in every `inventory_suppliers.ws_id` filter/insert.
- `normalizeWorkspaceId` is the canonical resolver, but Inventory is a
  registered satellite. Resolve the actor first with
  `resolveSessionAuthContext(req, { allowAppSessionAuth: { targetApp:
  'inventory' } })`, map its failure to the route's existing non-disclosing 404,
  resolve once with `normalizeWorkspaceId(rawWsId, auth.supabase)`, and call
  `getPermissions({ user: auth.user, wsId: resolvedWsId })`. Do not add a new
  direct Supabase-auth actor lookup. Use only the resolved UUID for the service-
  role query, insert, update, and delete predicates.
- Preserve operation order where contractually observable: collection query
  validation remains before authorization; body validation follows the settled
  Plans 258/275 contract. Alias-resolution failure is non-disclosing
  `404 {"error":"Not found"}` and causes no private-schema call.
- UUID routes preserve all current success/error envelopes. `personal` and a
  valid case-normalized handle must behave exactly like the canonical UUID.
  Unknown/invalid handles return the same 404 and never fall through to raw SQL.
- Rust GET already queries `authorization.ws_id`; retain it byte-for-byte unless
  parity tests expose drift. POST/PUT/DELETE remain Next-owned.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Callers | `rg -n 'product-suppliers' apps/mobile apps/inventory apps/contacts packages/internal-api --glob '!**/messages/*.json'` | supported UUID/personal/handle callers and methods are classified |
| Inventory tests | `bun --cwd apps/inventory vitest run src/__tests__/product-supplier-workspace-aliases.test.ts src/__tests__/product-supplier-item-update-payload.test.ts` | UUID, personal, handle, failure, and Plan 275 contracts pass |
| Rust parity | `cd apps/backend && cargo test workspaces_product_suppliers` | Rust GET alias/UUID parity passes |
| Apps | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | Inventory typecheck/build pass |
| Backend/repository | `bun check:backend && bun check && git diff --check` | backend, canonical, and whitespace gates pass |

## Scope

**In scope:** the supplier collection GET/POST and item PUT/DELETE route
workspace-resolution seams; one new Inventory route-contract test. The Rust
handler is test/evidence-only unless a parity correction is necessary.

**Out of scope:** changing supplier fields, pagination/search, permission names,
response messages, database schema/RLS, maintained supplier URLs, category or
warehouse source, generated types, Rust mutations, or route migration status.

## Steps

1. Characterize canonical UUID behavior plus raw-alias failures before editing.
   Add fixtures for `personal`, mixed-case handle, unknown handle, invalid alias,
   and resolver error across every supported method.
2. In both supplier modules, resolve the Inventory app-session/cookie/Bearer
   actor through `resolveSessionAuthContext`, resolve `wsId` exactly once with
   that context, and pass the explicit actor plus canonical UUID to permissions
   and all private-schema operations. Return the existing non-disclosing 404 on
   auth/resolution failure and assert zero admin queries.
3. Preserve Plans 258/275 strict body contracts and existing UUID envelopes.
   Add assertions that personal/handle calls use only the resolved UUID in
   insert and `.eq('ws_id', ...)` predicates.
4. Verify the prepared Rust GET still produces the same canonical query for
   UUID, personal, and handle inputs; change Rust only if a real parity defect is
   demonstrated and then follow backend ownership/gates.
5. Run caller inventory, focused tests, Inventory typecheck/build, backend and
   repository gates, whitespace, and scope review.

## Done criteria

- [ ] UUID, personal, and handle requests resolve to one UUID before private
      supplier access.
- [ ] Resolution failure is a non-disclosing 404 with zero private mutation.
- [ ] UUID response contracts and Plans 258/275 field allowlists are unchanged.
- [ ] TypeScript GET matches the prepared Rust authorization workspace.
- [ ] Focused, app, backend, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred; the exact Inventory app-session target
shape has drifted; a caller relies on raw unresolved IDs;
Plans 258/275 are concurrently editing these modules; actor-aware resolution
cannot preserve app-session/Bearer auth; Rust parity requires unrelated route
changes; or a mandatory gate fails twice.

## Maintenance notes

Permission resolution and data scoping must consume the same canonical
workspace ID. Never authorize an alias and then pass that raw alias to a
service-role query.
