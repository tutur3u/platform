# Plan 294: Delete Finance Invoices Through the Parent Row

> **Executor instructions:** After the existing workspace and permission check,
> delete only the workspace-qualified invoice parent. Let the database's
> validated foreign-key actions settle dependents atomically; never pre-delete
> financial facts in application code.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route.ts' 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route.test.ts' apps/database/supabase/migrations tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the active Finance/Inventory migration owner
  claims all Finance application paths
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** correctness / financial integrity
- **Depends on:** Finance exact-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The invoice DELETE route removes products and promotions in separate committed
operations before deleting the invoice. Both child relationships already use
validated `ON DELETE CASCADE` foreign keys. A transient later failure can
therefore leave the invoice alive after permanently erasing line items or
promotion history; a retry cannot reconstruct those financial facts.

## Current state and exact contract

- Preserve app-session/cookie actor resolution, normalized workspace,
  `delete_invoices` permission, sanitized errors, and the success JSON
  `{ message: 'success' }`.
- Current dependents are governed as follows: `finance_invoice_products`,
  `finance_invoice_promotions`, `wallet_transactions`, and
  `finance_invoice_user_groups` cascade on parent deletion; Inventory commerce
  references use `ON DELETE SET NULL`. Before editing, inventory every current
  foreign key to `finance_invoices(id)` and confirm each action is intentional.
  STOP on a restrictive/manual dependent or unvalidated constraint; do not
  improvise a partial cleanup.
- Replace the existence query plus two child deletes plus parent delete with one
  service-role parent delete filtered by both `id = invoiceId` and
  `ws_id = normalizedWsId`, returning `id` through `.select('id').maybeSingle()`.
  Database FK actions then commit or roll back with the parent statement.
- A query error returns the existing sanitized `{ message: 'Error deleting
  invoice' }`, status 500. A successful zero-row result, including absent,
  already-deleted, or foreign-workspace IDs, returns the existing non-disclosing
  `{ message: 'Invoice not found' }`, status 404. Success returns the existing
  200 envelope. No preliminary read is needed.
- The route must never directly delete from `finance_invoice_products` or
  `finance_invoice_promotions`. Do not change the FK definitions in this plan;
  their current validated actions are the atomicity boundary.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact route/test
transfer from the canonically working Finance/Inventory handoff. Read the
nearest Finance AGENTS file and inspect current FK definitions without applying
or modifying migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route.test.ts'` | permission, tenant, failure preservation, success, and replay cases pass |
| Child-delete absence | `if rg -n "from\('finance_invoice_(products|promotions)'\)" 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route.ts'; then exit 1; fi` | item route contains no manual child delete |
| Finance app | `bun run --cwd apps/finance type-check && bun run --cwd apps/finance build` | Finance app compiles and builds |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |
| Scope | `git status --short` | only the invoice item route and focused test changed |

## Scope

**In scope:** the Finance invoice item route and its existing focused test.

**Read-only evidence:** every migration defining a foreign key to
`finance_invoices(id)`.

**Out of scope:** schema/type changes; invoice creation/update; payment,
inventory, wallet, audit, or receipt semantics; changing FK actions; bulk
deletion; UI; Rust cutover artifacts.

## Steps

1. Expand the existing route fixture with a workspace-qualified parent-delete
   chain. Add red cases for permission denial, foreign/absent zero-row 404,
   parent-delete error 500, success, and replay. Assert no child table is ever
   queried or mutated, especially when the parent delete fails.
2. Inventory all current `finance_invoices(id)` foreign keys and record their
   validated cascade/set-null behavior in the coordination note. STOP on any
   dependent that cannot settle safely inside the single parent statement.
3. Replace the preliminary read and manual child deletes with the one returning
   parent delete. Preserve exact auth, error, and success envelopes.
4. Run focused, absence, Finance typecheck/build, repository, whitespace, and
   exact-scope gates.

## Done criteria

- [ ] The route performs exactly one workspace-qualified invoice mutation after authorization.
- [ ] A failed parent delete preserves the parent and every child fact through database atomicity.
- [ ] Successful deletion relies only on reviewed validated cascade/set-null actions.
- [ ] Foreign, absent, and replayed IDs return the non-disclosing 404; success remains 200 with the same envelope.
- [ ] No migration, generated type, unrelated Finance behavior, or child-delete code changes.
- [ ] Focused, absence, Finance typecheck/build, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on active-owner refusal; any restrictive, unvalidated, ambiguous, or
application-managed invoice dependent; changed FK behavior; a supported caller
that requires idempotent 200 replay instead of the frozen 404; required schema
work; unrelated route drift; or any mandatory gate failing twice.

## Maintenance notes

When foreign keys already encode a graph's delete semantics, deleting the
parent is the transaction. Reintroducing child-first cleanup recreates the
irrecoverable partial-commit window this plan removes.
