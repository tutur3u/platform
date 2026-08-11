# Plan 235: Transition Mobile Deployments Atomically

> **Executor instructions:** Commit version status, environment pointer, and
> audit event through one stale-state-aware transaction for both activation and
> rollback; concurrent operators must not interleave the deployment authority.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/mobile-deployment 'apps/infrastructure/src/app/api/v1/mobile-deployment/activate' 'apps/infrastructure/src/app/api/v1/mobile-deployment/rollback' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 154 and database/generated-type
  ownership must clear; coordinate the live Infrastructure authority with Plans
  173/174/201
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / deployment state machine / test coverage
- **Depends on:** Plans 154 and 163; database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Activation and rollback each archive the current version, activate another,
move the environment pointer, and write audit history as independent commits.
A failure between phases leaves no active version or a pointer to an archived
version. Concurrent transitions have no lock and can interleave, yet the API
returns only a generic failure after state may already have changed.

## Current state and exact contract

- Preserve route authorization, JSON mutation guard, successful state response,
  draft readiness evaluation, latest-draft activation, latest-archived rollback,
  and existing `draft_not_ready`/no-target 400 responses.
- Add one service-role-only transition RPC with exact signature
  `private.transition_mobile_deployment_version(p_environment_id uuid,
  p_target_version_id uuid, p_expected_active_version_id uuid,
  p_actor_user_id uuid, p_operation text) returns uuid`.
- `p_operation` is exactly `activate` or `rollback`. The function locks the
  environment, compares `active_version_id IS NOT DISTINCT FROM
  p_expected_active_version_id`, proves the target belongs to the environment
  and is `draft` for activate or `archived` for rollback, archives the current
  active version, activates the target, updates the pointer, and inserts the
  existing `version.activated`/`version.rolled_back` audit event atomically.
  Preserve `actor_type='user'`, `actor_user_id`, environment/version IDs, and
  `metadata={"version": <target version number>}` exactly.
- A stale expected pointer or changed target raises named
  `MOBILE_DEPLOYMENT_STALE` and maps to
  `409 {code:'deployment_state_changed',message:'Mobile deployment state changed; refresh and retry'}`.
  Other unexpected RPC failures retain the existing sanitized 500 route bodies.
- Allow zero active versions before the first activation. Enforce at most one
  `status='active'` version per environment with a partial unique index.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from completed Plan 163 only after Plan 154 is
green. Confirm Plans 173/174/201 have not moved or retired the live
Infrastructure store. No active note currently claims these exact runtime
paths, but migration/type ownership still requires transfer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused store/routes | `bun --cwd apps/infrastructure vitest run src/lib/mobile-deployment/store-transition.test.ts 'src/app/api/v1/mobile-deployment/activate/route.test.ts' 'src/app/api/v1/mobile-deployment/rollback/route.test.ts'` | readiness, success, stale, RPC failure, and route mapping cases pass |
| Existing mobile suite | `bun --cwd apps/infrastructure vitest run src/lib/mobile-deployment 'src/app/[locale]/(dashboard)/[wsId]/mobile-deployment' 'src/app/api/v1/mobile-deployment'` | current bundle/access/client behavior remains green |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/mobile-deployment-transitions.sql && bun --cwd apps/database sb:validate:isolated` | transition, rollback, rollback-on-error, concurrency, index, and ACL assertions pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/mobile-deployment-transitions.sql` | generated RPC types are current; no unrelated drift |
| Infrastructure | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** activation/rollback store seam and new focused module/tests; both
route tests; one additive migration and pgTAP file; generated DB types. Extract
transition orchestration from the 1,415-line `store.ts`, retaining thin stable
re-exports, so every substantially edited module is below 700 LOC. **Out of
scope:** bundle reads, secret/file upload and validation rules, CI tokens,
provider deployment, UI/messages, live Web fork cleanup, production apply, or
changing which draft/archive is selected.

## Steps

1. Add injectable store/route characterization for no target, draft readiness,
   success state refresh, audit naming, generic failure, and response bodies.
   Add red stale-state and partial-write cases.
2. Add a migration preflight that aborts on multiple active versions or an
   environment pointer whose referenced version has a different environment or
   non-active status. Do not repair production data implicitly. Add a named
   partial unique index on `(environment_id) where status='active'`.
3. Create the exact RPC. Lock the environment `FOR UPDATE`, use
   `IS DISTINCT FROM` for nullable expected-pointer comparison, lock/validate
   current and target versions, make all three state writes plus audit one
   transaction, and return the target UUID. Revoke the exact signature from
   PUBLIC, `anon`, and `authenticated`; grant only `service_role`.
4. Keep TypeScript readiness checks before dispatch. Pass the selected target
   and observed active pointer to the RPC, map only the named stale result to
   409, and reload state after commit. Do not perform fallback direct writes.
5. Add pgTAP for first activation, replacement activation, rollback, wrong
   environment/status, stale pointer, unique-active enforcement, audit rollback,
   and ACLs. For concurrency, hold the environment row in a credential-free
   setup dblink transaction, dispatch activate and rollback on two named worker
   connections, assert both are busy at the barrier, release setup, then prove
   exactly one coherent transition wins and the loser is stale. Always release
   the setup transaction/connections before fixture restoration on exceptions.
6. Run focused/existing tests, full DB, isolated typegen, Infrastructure
   typecheck/build, repository, source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Statuses, active pointer, and audit event commit as one transition.
- [ ] Concurrent transitions serialize; stale callers receive the closed 409
      and cannot overwrite the winner.
- [ ] PostgreSQL permits at most one active version per environment and the RPC
      is service-role-only.
- [ ] Existing readiness, target selection, and successful state response remain
      unchanged.
- [ ] Focused/full DB, typegen, Infrastructure typecheck/build, repository, and
      whitespace gates pass; edited source modules are below 700 LOC.

## STOP conditions

Stop on inconsistent existing deployment state, red Plan 154 baseline,
ownership conflict, a caller outside the two named routes/store seam, need to
change readiness/provider semantics, production apply need, or any mandatory
gate failing twice.
