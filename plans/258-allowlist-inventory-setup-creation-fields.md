# Plan 258: Allowlist Inventory Setup Creation Fields

> **Executor instructions:** Close the three legacy Inventory setup POST bodies
> to the one supported editable field. Preserve their URLs, authorization,
> response envelopes, Mobile compatibility, and Rust GET-only fallthrough.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-categories/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-warehouses/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-suppliers/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-categories/[categoryId]/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/product-warehouses/[warehouseId]/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/categories/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/warehouses/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/suppliers/route.ts' apps/inventory/src/__tests__/inventory-setup-create-payloads.test.ts apps/mobile/lib/data/repositories/inventory_repository.dart apps/backend/src/workspaces_product_categories.rs apps/backend/src/workspaces_product_warehouses.rs apps/backend/src/workspaces_product_suppliers.rs tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Inventory migration handoff
  owns `apps/inventory/src/**`; obtain exact transfer of the three collection
  routes and new test before editing
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** security / API input validation / tests
- **Depends on:** exact-path transfer from the active Inventory owner
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The three compatibility POST routes spread arbitrary caller JSON into database
inserts after only overriding `ws_id`. Their generated insert types include
server-owned `id` and `created_at`, so an otherwise authorized Inventory creator
can choose primary keys or forge catalog chronology. The maintained Inventory
routes and the Mobile client already use a name-only contract; closing these
compatibility bodies removes mass assignment without changing supported use.

## Current state and exact contract

- `product-categories/route.ts:74-95`, `product-warehouses/route.ts:79-103`,
  and `product-suppliers/route.ts:72-104` parse untyped JSON and insert
  `{ ...data, ws_id }` through user or service-role clients.
- Generated insert types at `packages/types/src/supabase.ts:7983-8003` and
  `:24720-24745` expose `id` and `created_at`; the supplier relation exposes
  the same server-owned metadata.
- The category and warehouse item routes already validate a bounded optional
  `name`; the maintained `inventory/categories`, `inventory/warehouses`, and
  `inventory/suppliers` collection routes use Zod name schemas. Mobile creates
  categories and warehouses with exactly `{ "name": name }` at
  `apps/mobile/lib/data/repositories/inventory_repository.dart:327-374`.
- For all three compatibility POSTs, accept only a JSON object with one required
  `name`: trimmed string, minimum one character, maximum `MAX_NAME_LENGTH`.
  Use a strict Zod object so `id`, `created_at`, `ws_id`, and every unknown key
  return `400 { "message": "Invalid request body" }` and never reach insert.
  Malformed JSON returns `400 { "message": "Invalid JSON body" }`.
- Preserve the current permission checks and successful
  `200 { "message": "success" }` envelope. Preserve current sanitized database
  failure bodies. The insert object must be exactly `{ name, ws_id }`. Preserve
  each route's current workspace derivation: categories and warehouses continue
  using their normalized route workspace, while suppliers continue using the
  raw route `wsId`. Normalizing the supplier route is a separate compatibility
  decision and is out of scope for this input-allowlist plan.
- Rust's prepared handlers own GET only and return `None` for POST. Do not edit
  Rust/OpenAPI or claim mutation parity. Do not redirect these compatibility
  URLs to the maintained routes; Mobile and Contacts still read them.
- This promotes the deferred supplier mass-assignment item and extends the same
  fix to categories and warehouses. No Plan 001-257 covers these POST bodies.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS, inspect active notes, and obtain the
Inventory transfer named above. Inventory every caller before editing; any
supported caller that sends a field besides `name` is a STOP requiring an
explicit versioned compatibility decision.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'product-(categories|warehouses|suppliers)' apps packages --glob '!**/messages/*.json' --glob '!plans/**'` | every POST caller is classified and sends only `name`; GET-only callers are unchanged |
| Focused routes | `bun --cwd apps/inventory vitest run src/__tests__/inventory-setup-create-payloads.test.ts` | all three auth, malformed, strict-body, insert, and database-error matrices pass |
| Existing Inventory | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/inventory/categories/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/warehouses/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/suppliers/route.test.ts' src/__tests__/inventory-item-workspace-scope.test.ts` | maintained setup and compatibility item behavior pass |
| Mobile analysis | `cd apps/mobile && flutter analyze lib/data/repositories/inventory_repository.dart` | the existing name-only callers remain valid |
| Types/build | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | Inventory compiles and builds |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the three compatibility collection route files and one new
focused route test at `apps/inventory/src/__tests__/inventory-setup-create-payloads.test.ts`.

**Out of scope:** maintained `inventory/*` route behavior; item PUT/DELETE;
GET pagination/envelopes; permissions; database schema/RLS/types; Mobile or
Contacts source changes; supplier auditing; Rust/OpenAPI; Web/TanStack route
artifacts; migration of callers to new URLs.

## Steps

1. Add the focused test first. Mock each route's authorization/client seam and
   prove permission denial occurs before insert, malformed/non-object/empty/
   overlong/unknown-field bodies return 400, and valid `{ name }` reaches an
   insert containing only trimmed `name` plus the route-derived `ws_id` using
   that route's existing resolution behavior.
2. Add one strict create schema per route, reusing `MAX_NAME_LENGTH`. Parse
   JSON safely, reject unknown keys, and build the insert explicitly; never
   spread request data into a database mutation.
3. Prove `id`, `created_at`, caller `ws_id`, null, arrays, and mixed valid plus
   extra fields never reach insert. Preserve the current authorization and
   success/database-error envelopes exactly.
4. Run caller inventory, focused and maintained route suites, Mobile analysis,
   Inventory typecheck/build, `bun check`, whitespace, and exact-scope review.

## Test plan

- Repeat the same table-driven cases for category, warehouse, and supplier.
- Assert a trimmed valid name; categories/warehouses retain normalized `ws_id`,
  while suppliers retain their current raw route `wsId` behavior.
- Assert malformed JSON and every server-owned/unknown field return 400.
- Assert permission denial and lookup failure trigger no database mutation.
- Assert database failure remains sanitized and success remains the existing
  200 envelope.

## Done criteria

- [ ] No compatibility setup POST spreads caller data into an insert.
- [ ] Only a bounded nonempty `name` plus server-derived `ws_id` can be stored.
- [ ] All existing supported callers and GET/item contracts remain unchanged.
- [ ] Focused/existing tests, Mobile analysis, typecheck, build, `bun check`,
      and whitespace pass.
- [ ] No database, generated type, Rust, Mobile, Contacts, or route artifact changed.

## STOP conditions

Stop if ownership is not transferred, a supported caller sends another field,
product policy requires another editable field, the maintained route contract
has drifted, strict rejection would need a versioned API, or any mandatory gate
fails twice after one reasonable correction.

## Maintenance notes

Privileged compatibility routes still require closed request schemas. A typed
database insert shape is not an HTTP allowlist and must never be populated by
spreading untrusted JSON.
