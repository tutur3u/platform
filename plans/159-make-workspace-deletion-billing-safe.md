# Plan 159: Make Workspace Deletion Fail Closed on Billing Revocation

> **Executor instructions:** A workspace must not be deleted while any
> non-terminal Polar subscription lookup or revocation is uncertain. Preserve
> a recoverable local association until every provider subscription is
> confirmed terminal.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/web/src/legacy-api-routes/workspaces/[wsId]/route.ts' 'apps/web/src/legacy-api-routes/workspaces/[wsId]/route.test.ts' 'apps/web/src/app/api/workspaces/[wsId]/route.ts' packages/payment-core apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** correctness / billing / destructive workflow
- **Depends on:** Pay migration handoff transfer and G22 route-artifact transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The workspace DELETE route catches subscription lookup or Polar revocation
errors and deletes the tenant anyway. Because the subscription row cascades
with the workspace, a provider subscription can keep billing after the local
tenant and the reconciliation identifier are gone.

## Current state

- `apps/web/src/legacy-api-routes/workspaces/[wsId]/route.ts:237-265` calls
  `.maybeSingle()` for one non-canceled subscription, swallows every failure,
  then deletes the workspace.
- Multiple non-terminal rows make `.maybeSingle()` fail; a transient provider
  error follows the same destructive path.
- The workspace-subscription foreign key is `ON DELETE CASCADE` (created on
  `workspace_subscription`, later renamed to `workspace_subscriptions`).
- The colocated route test covers permission, deletion prevention, and success,
  but not lookup failure, duplicate active rows, or provider failure.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read the Pay handoff
and current `packages/payment-core` subscription helpers. Obtain route and
provider-semantics ownership before editing. This plan is deliberately the
schema-free synchronous fail-closed slice; do not add a deletion job or
migration. Confirm the provider's already-revoked/not-found semantics before
coding so retries can safely resume a partial earlier revocation.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun run --cwd apps/web test -- 'src/legacy-api-routes/workspaces/[wsId]/route.test.ts'` | every deletion/billing case passes |
| Payment tests | `bun run --cwd packages/payment-core test` | all payment-core tests pass |
| Route artifacts | `bun migration:tanstack:manifest` | current manifest with unchanged/fallthrough Rust ownership |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | production build passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** workspace DELETE handler/test; payment-core helper/tests needed to
enumerate and revoke all non-terminal subscriptions; TanStack route artifacts
required by a changed Web route.

**Out of scope:** account deletion (Plan 062), migrations/generated types or a
durable deletion job, Pay webhook cutover, invoice UI,
manual provider operations, changing workspace permission semantics, or
deleting local reconciliation rows before provider completion.

## Git workflow

Use `fix/workspace-deletion-billing-safety` and commit
`fix(billing): fail closed on workspace deletion`. Claim/release the commit
window; do not push or perform production provider/database actions.

## Steps

1. Characterize the provider terminal-state contract and enumerate all
   non-terminal workspace subscriptions; `.maybeSingle()` is forbidden.
   Verify tests for zero, one, and multiple rows.
2. Make lookup errors and every **unclassified** revocation error return one
   stable non-success envelope before any workspace delete. Define a narrow
   classifier for only the provider's explicitly documented terminal or
   already-absent error codes; those codes alone continue as retry success.
   Verify zero delete calls for all other exceptions and responses.
3. Revoke every non-terminal provider subscription before local deletion.
   Treat only the provider's documented already-terminal/not-found result as
   retry success; every other deterministic or ambiguous error fails closed
   while all local workspace/subscription rows remain.
4. Test provider success, deterministic failure, ambiguous timeout, retry after
   one of multiple subscriptions was already revoked (both terminal response
   and documented terminal exception forms), an unclassified 404/error, and
   local delete failure after all revocations.
5. Run route, payment, artifact, build, and repository gates.

## Done criteria

- [ ] No workspace delete runs after uncertain lookup or revocation.
- [ ] Every non-terminal subscription is enumerated and reconciled.
- [ ] Retry safely resumes partial provider revocation and keeps all local
      reconciliation rows until the final workspace delete.
- [ ] Failure tests prove zero destructive database mutation.
- [ ] Mandatory tests, route artifacts, build, and repository gates pass.

## STOP conditions

Stop on missing ownership, ambiguous provider terminal state, need for an
unapproved production operation, route/Rust ownership mismatch, destructive
default-stack action, or any gate failing twice.
