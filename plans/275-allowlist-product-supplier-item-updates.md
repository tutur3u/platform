# Plan 275: Allowlist Product Supplier Item Updates

> **Executor instructions:** Close the legacy product-supplier item PUT body to
> the maintained supplier route's supported editable field. Preserve the
> compatibility URL, authorization, workspace predicate, and response envelopes.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/suppliers/[supplierId]/route.ts' apps/inventory/src/__tests__/product-supplier-item-update-payload.test.ts apps/inventory/src/__tests__/inventory-item-workspace-scope.test.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Inventory migration handoff
  owns `apps/inventory/src/**`; obtain exact transfer of the compatibility item
  route and new focused test before editing
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** security / correctness / API input validation / tests
- **Depends on:** exact-path transfer from the active Inventory owner;
  coordinate with Plan 258 because both edit the product-supplier compatibility
  surface
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The compatibility PUT route passes arbitrary caller JSON to a private-schema
service-role update after authorizing only the route workspace. An otherwise
authorized Inventory updater can therefore replace the supplier's `ws_id` or
forge server-owned metadata, moving the supplier out of its authorized tenant
while existing batches can continue referencing it by ID. A strict name-only
body restores the same supported edit contract as the maintained supplier route
without changing the compatibility URL or successful response.

## Current state and exact contract

- `apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts:12-35`
  checks `update_inventory`, parses `await req.json()` without validation, then
  calls `.update(data)` through a private-schema admin client. The mutation is
  constrained by the supplier's current `id` and `ws_id`, but the update payload
  itself can replace `ws_id`, `id`, or `created_at`.
- `apps/database/supabase/migrations/20230330161750_add_inventory_and_healthcare_tables.sql:104-109`
  defines `inventory_suppliers` with `id`, `name`, `ws_id`, and `created_at`.
  Migration `20260528141100_move_inventory_tables_private.sql:1-3,37-59`
  revokes authenticated access and grants service-role table access, making the
  route's HTTP allowlist the relevant mutation boundary.
- `apps/database/supabase/migrations/20230330161750_add_inventory_and_healthcare_tables.sql:218-224`
  links `inventory_batches.supplier_id` to the supplier ID without encoding the
  supplier workspace. Moving a supplier can therefore leave a workspace's
  batches pointing at a supplier now owned by another workspace.
- Match the maintained contract in
  `apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/suppliers/[supplierId]/route.ts:16-18,27-60`:
  accept a JSON object whose only supported key is optional `name`, with `name`
  trimmed, nonempty when present, and bounded by `MAX_NAME_LENGTH`. Make the
  object strict so every unknown key is rejected rather than stripped.
- Malformed JSON returns
  `400 { "message": "Invalid JSON body" }`. JSON that is not an object, an
  unknown key, or any immutable/server-owned key such as `id`, `ws_id`, or
  `created_at` returns `400 { "message": "Invalid request body" }`; rejected
  input must never reach `.update()`.
- Preserve existing authorization ordering and statuses: unavailable workspace
  permission evidence returns the current 404 body; an actor lacking
  `update_inventory` returns the current 403 body. Preserve the route's raw
  `wsId` derivation and both `.eq('id', supplierId)` and `.eq('ws_id', wsId)`.
- Preserve the current success response exactly as
  `200 { "message": "success" }`. Preserve the current sanitized database
  failure status/body exactly, including its legacy message text; correcting
  response wording is a separate compatibility decision.
- The maintained supplier item route is the behavioral exemplar, but it is not
  changed by this plan. Plan 258 closes arbitrary bodies on the three setup
  collection POST routes and explicitly excludes item PUT/DELETE; this plan
  covers only the supplier compatibility item PUT.
- This is a narrow compatibility fix, not a substantial route rework. Do not
  move the route, change its URL, edit Rust/OpenAPI, or update TanStack migration
  artifacts. If implementation instead requires a substantial rewrite or an
  `apps/web` route change, stop and apply the repository's first-class route and
  Rust/TanStack migration duties in a separately reviewed scope.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root and Inventory instructions, inspect active notes,
and obtain the exact ownership transfer named above. Inventory every caller of
the compatibility PUT before tightening the body; a supported caller that sends
anything other than optional `name` is a STOP requiring an explicit versioned
compatibility decision.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'product-suppliers|productSuppliers|updateSupplier|supplierId' apps/mobile apps/contacts apps/inventory packages/internal-api --glob '!**/messages/*.json'` | every compatibility PUT caller is classified and sends no field other than optional `name`; read/delete and maintained-route callers are identified as unaffected |
| Focused payload contract | `bun --cwd apps/inventory vitest run src/__tests__/product-supplier-item-update-payload.test.ts` | authorization, malformed/non-object/strict-body, success, workspace predicate, and database-error cases pass |
| Existing item scope | `bun --cwd apps/inventory vitest run src/__tests__/inventory-item-workspace-scope.test.ts` | existing category, warehouse, and unit workspace-scope cases remain green |
| Inventory | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | Inventory typecheck and production build both exit 0 |
| Repository | `bun check && git diff --check` | canonical checks pass and whitespace output is empty |
| Exact scope | `git status --short -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts' apps/inventory/src/__tests__/product-supplier-item-update-payload.test.ts` | only the compatibility route and focused test are modified |

## Scope

**In scope:**

- `apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts`
  — narrow PUT JSON parsing and strict name-only allowlist; leave DELETE
  behavior unchanged.
- `apps/inventory/src/__tests__/product-supplier-item-update-payload.test.ts`
  — create a focused compatibility PUT contract suite.

**Out of scope:** the collection POST fixed by Plan 258; DELETE behavior;
maintained `inventory/suppliers` routes; workspace normalization; permission
semantics; response-envelope cleanup; supplier auditing; database migrations,
RLS, generated types, Mobile/Contacts source, Rust/OpenAPI, Web/TanStack route
artifacts, route relocation, and migration of callers to another URL.

## Steps

1. Create
   `apps/inventory/src/__tests__/product-supplier-item-update-payload.test.ts`.
   Follow the Vitest hoisted mocks and fluent Supabase chain style in
   `apps/inventory/src/__tests__/inventory-item-workspace-scope.test.ts`.
   Characterize permission denial, the exact current success envelope and
   `id`/`ws_id` predicates, and the exact current database-error envelope before
   changing the handler.
2. Add red table-driven cases proving malformed JSON and non-object JSON
   (`null`, array, string, number) return the specified 400 bodies. Add cases
   for `id`, `ws_id`, `created_at`, an arbitrary unknown key, and a valid name
   mixed with an unknown key; each must return 400 and make zero update calls.
3. In the compatibility route, add safe JSON parsing and
   `z.object({ name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional() }).strict()`.
   Reuse the maintained route's `name` constraints, but intentionally add
   `.strict()` here because its plain `z.object(...)` strips unknown keys while
   this compatibility boundary must reject them. Import and reuse
   `MAX_NAME_LENGTH`; do not infer a schema from generated database types. Pass
   only `parsed.data` (or an explicit `{ name }` object) to `.update()` and
   retain both existing row predicates.
4. Add green cases for a trimmed valid name, the bounded-name edges, an empty
   object matching the maintained optional-name contract, and database failure.
   Assert the admin update receives no caller-owned metadata and that permission
   denial occurs before body parsing or mutation. Preserve every response and
   status described above.
5. Run caller inventory, focused and existing tests, Inventory typecheck/build,
   `bun check`, whitespace, and exact-scope checks. Review the diff to confirm
   DELETE and every out-of-scope path are untouched.

## Test plan

- New test file:
  `apps/inventory/src/__tests__/product-supplier-item-update-payload.test.ts`.
- Model its module mocks, permission helper, and fluent Supabase mutation chain
  on `apps/inventory/src/__tests__/inventory-item-workspace-scope.test.ts`.
- Cover 404 unavailable permission evidence, 403 missing
  `update_inventory`, malformed JSON, every non-object JSON shape, unknown and
  immutable keys, mixed valid/unknown input, empty object, trimmed valid name,
  minimum/maximum name bounds, overlong/empty name, database error, and success.
- For every rejected or unauthorized case, assert JSON parsing/update ordering
  as applicable and zero admin update calls. On success, assert update payload,
  `id` plus `ws_id` predicates, 200 status, and exact response JSON.
- Verification:
  `bun --cwd apps/inventory vitest run src/__tests__/product-supplier-item-update-payload.test.ts src/__tests__/inventory-item-workspace-scope.test.ts`
  exits 0 with all focused and existing cases passing.

## Done criteria

- [ ] The compatibility supplier PUT accepts only a strict object with optional
      bounded, trimmed `name`; no caller-controlled metadata reaches update.
- [ ] Malformed/non-object JSON, unknown keys, `id`, `ws_id`, and `created_at`
      return the specified 400 response and cause no mutation.
- [ ] Permission, route-workspace predicates, success envelope, and sanitized
      database-error behavior are unchanged; DELETE is untouched.
- [ ] Focused/existing tests, Inventory typecheck/build, `bun check`, and
      whitespace gates pass.
- [ ] Only the compatibility item route and its focused test are modified; no
      database, generated type, Rust/OpenAPI, Web/TanStack, Mobile, Contacts, or
      maintained-route artifact changes.

## STOP conditions

Stop if ownership is not transferred, Plan 258 is concurrently editing the
same item route, the maintained route's name contract has drifted, any supported
compatibility PUT caller sends another field, product policy requires another
editable field, strict rejection requires a versioned API, preserving the
current response envelopes is impossible, the fix becomes a substantial route
rewrite or touches `apps/web`, any out-of-scope file is required, or a mandatory
gate fails twice after one reasonable correction.

## Maintenance notes

Private-schema service-role routes need explicit HTTP field allowlists; generated
database update types are not request schemas. Keep this compatibility PUT's
editable fields aligned with the maintained supplier route, and require a
reviewed compatibility decision before expanding either contract.
