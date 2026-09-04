# Plan 295: Allowlist Inventory Product Updates

> **Executor instructions:** Replace the privileged request-to-update spread
> with one strict, explicit product mutation contract. Do not change inventory
> quantity semantics in this plan.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/[productId]/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/[productId]/route.test.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/[productId]/inventory/request.ts' packages/types/src/primitives/Product.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** security / correctness
- **Depends on:** exact-path transfer from the active Finance/Inventory owner
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The product PATCH authorizes the source workspace, then spreads almost every
caller key through a service-role update. A permitted catalog editor can
therefore change `ws_id` or `id`, moving a product into another tenant or
rewriting its identity while retaining relations validated only against the
source workspace.

## Current state and exact contract

- `.../products/[productId]/route.ts:246-252` casts raw JSON to `Product2` and
  removes only `inventory`, `manufacturer`, and `manufacturer_id`.
- Lines 320-333 spread the remaining `data` into `workspace_products.update`.
  The `.eq('ws_id', wsId)` constrains the old row, not the new values.
- `packages/types/src/primitives/Product.ts:45-82` includes `id` and `ws_id`;
  generated Update types also expose `created_at` and `creator_id`.
- Create `ProductUpdateRequestSchema` in the route module (or a focused sibling
  if the route would otherwise grow) as a **strict** object. It may contain only
  `archived`, `avatar_url`, `category_id`, `description`,
  `finance_category_id`, `manufacturer`, `manufacturer_id`, `name`, `owner_id`,
  `usage`, and the existing nested `inventory` contract. Preserve the current
  nullability/type behavior for these supported keys. Export the underlying
  no-default inventory array schema from `inventory/request.ts` and embed it as
  `.optional()`; do **not** reuse the defaulted field in a way that turns an
  omitted `inventory` key into `[]`. Preserve the current empty-object request
  no-op and preserve metadata-only field updates without entering inventory
  work; never clear inventory unless the caller explicitly supplied it.
- Reject malformed JSON, arrays/primitives, unknown keys, and protected keys
  including `id`, `ws_id`, `created_at`, and `creator_id` with the existing
  `{ message: 'Invalid payload' }`-style 400 contract. Never silently strip.
- Build `updateData` only from parsed supported fields. Keep manufacturer and
  tenant relation validation, inventory permission checks, audit behavior,
  normalized workspace ID, success envelope, and 404/500 mappings unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain exact transfer from
`tmp/agent-coordination/20260709-123138-claude-finance-inventory-migration.md`
and the older nonterminal Inventory handoff. Preserve unrelated Inventory work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/products/[productId]/route.test.ts'` | supported updates pass; protected and unknown keys are rejected before update |
| Inventory app | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | app compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only the route/test, `inventory/request.ts`, an optional focused schema sibling, and plan status changed |

## Scope

**In scope:** the product item route and its existing focused test;
`products/[productId]/inventory/request.ts` only to export the existing
no-default item-array schema; a focused request-schema sibling only if needed
to keep the route maintainable.

**Out of scope:** stock transaction atomicity (Plan 297); create/delete
behavior; database schema/types; product relationship policy; permissions;
response redesign; other compatibility routes.

## Steps

1. Add red PATCH tests for malformed JSON, non-object bodies, an empty object,
   each protected key, a mixed valid-plus-unknown payload, and a foreign
   `ws_id`. Assert no admin `.update` call in every rejection case. Prove empty
   and metadata-only bodies do not invoke inventory delete/insert/clear work.
2. Add the strict allowlist and parse before manufacturer/relation/database
   work. Construct the update object field-by-field from parsed data.
3. Characterize valid partial fields, explicit nulls, legacy manufacturer
   input, nested inventory permission denial, relation denial, normalized
   workspace scoping, database failure, not found, and success/audit behavior.
4. Run focused tests, Inventory typecheck/build, `bun check`, whitespace, and
   scope gates.

## Done criteria

- [ ] No caller can write `id`, `ws_id`, timestamps, creator fields, or unknown keys.
- [ ] Every admin update is built only from parsed allowlisted fields.
- [ ] Existing supported fields, relations, inventory permission, audit, and envelopes remain characterized.
- [ ] Focused, app, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on missing ownership transfer; a supported caller that relies on unknown
or protected fields; an intended mutable database column absent from the exact
allowlist; a need to change stock semantics/schema; route growth beyond 700
lines without extraction; or any mandatory gate failing twice.

## Maintenance notes

Generated database Update types are not HTTP schemas. Keep this boundary
strict whenever `workspace_products` gains a column.
