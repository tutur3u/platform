# Plan 169: Delete Whiteboard Records Before Destructive Asset Cleanup

> **Executor instructions:** Make the database row the authoritative deletion
> boundary. Never remove a whiteboard's stored images while a database failure
> can still leave that whiteboard reachable and referencing those images.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/whiteboards/[boardId]' 'apps/web/src/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]' apps/web/src/__tests__/whiteboard-route.test.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** correctness / destructive mutation
- **Depends on:** G22 route-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The DELETE handler recursively removes every object under the whiteboard
prefix before deleting the database row. If the final database delete errors or
returns no row, the API reports failure but the whiteboard remains reachable
with permanently missing images. Database truth must be committed before an
irreversible cross-system cleanup begins.

## Current state

- `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/whiteboards/[boardId]/route.ts:276-351`
  verifies the board, recursively lists/removes storage paths, and only then
  deletes `workspace_whiteboards` through the admin client.
- A storage failure returns 500 before the row changes, which is safe. A later
  row-delete failure returns 500 after assets are gone, which is not recoverable.
- `apps/web/src/__tests__/whiteboard-route.test.ts:190-249` explicitly freezes
  the unsafe storage-before-row ordering and has no downstream database-failure
  assertion.
- The route is a legacy implementation behind a generated first-class wrapper.
  The wrapper also exports generated HEAD behavior for GET; a first-class move
  must preserve it. The manifest tracks the route as `legacy-next` and no Rust
  handler owns it.

## Exact contract

- Verify the board exists under `(ws_id, board_id)`, then delete that row and
  require the returned ID before starting any storage list/remove operation.
- A database error or zero-row result returns the existing sanitized 500/404
  and invokes no storage method.
- After a confirmed row delete, recursively remove the board prefix. Storage
  cleanup is best-effort operational cleanup: log a stable structured error
  code without paths or raw provider text, but keep the deletion response 200
  because the user-visible board is already gone. Orphaned objects are safer
  than a reachable board with missing content and can be handled by a future
  storage-reconciliation job.
- Preserve GET/PATCH behavior, the exact successful DELETE body
  `{ success: true }`, membership semantics, storage prefix containment, and
  generated HEAD behavior.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain the G22 route-artifact transfer. Read root/Web
AGENTS and confirm there is still no Rust handler or supported caller depending
on a 500 after post-delete storage cleanup failure.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/route.test.ts'` | ordering, failure, recursion, and compatibility cases pass |
| Web route ownership | `bun web:api-routes:check` | exits 0 and does not recreate or modify the removed legacy implementation/generated wrapper |
| Manifest | `bun migration:tanstack:manifest` | first-class route remains tracked `legacy-next` with the new source file |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** move the one whiteboard item route from legacy to its first-class
path; move/replace only its existing route test into a colocated first-class
test; the exact TanStack override and generated manifest entry.

**Out of scope:** whiteboard permissions/RLS, image-upload behavior, PATCH image
cleanup, storage analytics, a durable orphan-cleanup worker, UI copy, schema or
generated types, Rust implementation, or production cutover.

## Git workflow

Use branch `fix/whiteboard-delete-order` and commit
`fix(whiteboards): delete records before assets`. Use an isolated worktree, run
`bun setup` immediately, claim/release the commit window, and do not push.

## Steps

1. **Move and characterize the route.** `git mv` the legacy route into the
   existing first-class wrapper path, replacing only the generated wrapper.
   Move the relevant cases from `apps/web/src/__tests__/whiteboard-route.test.ts`
   to a new colocated `route.test.ts`; leave unrelated whiteboard tests in
   place. Recreate `HEAD = createLegacyHeadHandler(GET)`. Add an explicit
   `legacy-next`/`rust-backend` override for the new source and regenerate the
   manifest.

   **Verify:** focused tests preserve GET/PATCH/HEAD/DELETE response contracts,
   `bun web:api-routes:check` exits 0 without regenerating the legacy file, and
   the manifest points at the first-class file without claiming Rust parity.

2. **Freeze destructive failure ordering.** Add DELETE tests for initial lookup
   error/missing row, row-delete error/missing row, storage list failure,
   storage remove failure, nested/paginated prefix cleanup, and success. Assert
   no storage call occurs before a returned deleted row. Assert cleanup failures
   after deletion are sanitized server logs and still return 200.

   **Verify:** the new downstream-delete-error test fails against the current
   ordering, then the complete focused suite passes after Step 3.

3. **Commit database truth first.** Move the scoped `.delete().select('id')`
   before prefix enumeration. Return on database error/no row. Only after a
   returned ID, list and remove storage under the existing derived prefix.
   Catch cleanup errors, log a stable code and board/workspace-safe identifiers
   only, and preserve the successful response.

   **Verify:** focused tests prove the exact call order and all failure cases.

4. **Run all gates.** Run `bun web:api-routes:check`, the manifest generator,
   Web typecheck/build, `bun check`, and whitespace verification.

## Done criteria

- [ ] No whiteboard asset is removed before the scoped database delete returns
      the deleted row.
- [ ] Database failure/no-row paths leave storage untouched and preserve the
      existing public error envelopes.
- [ ] Post-delete storage failure cannot make a reachable whiteboard lose
      content and does not falsely report the already-committed row deletion as
      uncommitted.
- [ ] GET/PATCH/HEAD and successful DELETE contracts remain unchanged.
- [ ] The Web API route wrapper guard passes without recreating the deleted
      legacy implementation.
- [ ] Focused tests, manifest, typecheck, build, repository, and whitespace
      gates pass.

## STOP conditions

Stop on missing G22 transfer, a supported caller requiring storage cleanup to
be atomic with the row delete, evidence of a Rust implementation, any need for
a schema/job migration, loss of generated HEAD behavior, storage prefixes not
provably contained by normalized workspace and board IDs, or a gate failing
twice.

## Maintenance notes

This plan deliberately chooses an orphaned inaccessible object over user-visible
data loss. If orphan volume becomes material, add a separately reviewed durable
storage-reconciliation job rather than restoring storage-first deletion.
