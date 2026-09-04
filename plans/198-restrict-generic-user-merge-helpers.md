# Plan 198: Restrict Generic Workspace-User Merge Helpers

> **Executor instructions:** Remove direct untrusted execution of the two
> caller-parameterized `SECURITY DEFINER` merge helpers while preserving the
> fixed, resumable merge phases that call them internally.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/users-core/src/routes/users/merge.ts packages/users-core/src/routes/users/merge-bulk.ts tmp/agent-coordination`
> Stop if either function signature, grant, or phased caller graph changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / database authorization
- **Depends on:** Plan 154 must restore the green full isolated pgTAP baseline;
  execute from the completed Plan 163 base after Contacts/database ownership
  transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Two public definer helpers accept table and column identifiers from an
authenticated caller, then interpolate those identifiers into an RLS-bypassing
update. Their permission check proves only that the caller may merge users in
one workspace; it does not constrain the selected relation, column, or mutated
rows to the supported merge graph or that workspace.

## Current state

- `20260205000002_batched_workspace_user_merge.sql:11-77` defines
  `merge_workspace_users_batch_update`. It validates `delete_users` and
  `update_users`, then applies caller-selected quoted relation/column names.
- Lines 145-432 call that helper from fixed phase functions, but lines 447-452
  also grant the generic signature directly to `authenticated`.
- `20260205000003_single_table_batch_merge.sql:8-100,124-125` repeats the same
  public generic boundary as `merge_workspace_users_table_batch`.
- `20260531200539_move_external_user_monthly_reports_private.sql:867-876`
  expands the first helper's search path to `public, private, pg_temp`.
- Plan 166 changes the bulk HTTP result/UI contract and explicitly excludes RPC
  or schema changes. Plan 171 covers different fixed identity-repair RPCs.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root/database instructions. Obtain a precise
Contacts/database merge-boundary claim, confirm Plan 154 is DONE, and use an
isolated worktree based on the completed Plan 163 integration base. Run
`bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller graph | `rg -n "merge_workspace_users_(batch_update|table_batch)" apps packages --glob '!packages/types/src/supabase.ts'` | only historical definitions, fixed phase calls, and focused tests |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-user-merge-helper-security.sql` | direct ACL denials and fixed-phase behavior pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP suite passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-user-merge-helper-security.sql` | succeeds |
| Type diff | `git diff --exit-code -- packages/types/src/supabase.ts` | no generated-type drift for ACL-only hardening |
| Users Core | `bun run --cwd packages/users-core type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive migration created by `bun sb:new`; new focused
`apps/database/supabase/tests/workspace-user-merge-helper-security.sql`;
generated types only as a required no-diff target; read-only characterization
of fixed merge phases and users-core callers.

**Out of scope:** Plan 166's bulk UI/result work; changing merge tables,
ordering, batching, or public fixed-phase response bodies; moving either helper
between schemas unless ACL-only hardening proves insufficient; production apply.

## Git workflow

Use `fix/restrict-generic-user-merge-helpers` and commit
`fix(database): restrict generic user merge helpers`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Inventory every direct and nested call. Prove runtime callers invoke only
   fixed phase/orchestration RPCs, not either generic signature. **Verify:** the
   caller command has no supported direct client caller; STOP if it does.
2. Add an exact-signature migration that revokes both helpers from `PUBLIC`,
   `anon`, and `authenticated`, and grants them only to `service_role` (while
   retaining owner-internal execution from definer phase functions). Do not
   widen their search paths or bodies. **Verify:** pgTAP privilege assertions
   cover every role/signature.
3. Add behavior pgTAP proving an authenticated direct generic call is denied,
   an authorized fixed phase still moves only its hard-coded relation/column,
   an unauthorized phase still fails, and a foreign-workspace row remains
   untouched. Include both helpers if both remain reachable internally.
4. Run focused/full isolated database validation, typegen/no-diff, users-core
   typecheck, repository, and whitespace gates.

## Done criteria

- [ ] Neither generic helper is executable by `PUBLIC`, `anon`, or
      `authenticated`; only trusted server/owner execution remains.
- [ ] Authenticated fixed-phase merge orchestration retains its existing
      response and resumable behavior.
- [ ] Tests prove fixed relations only and no foreign-workspace mutation.
- [ ] Focused/full pgTAP, typegen no-diff, users-core, repository, and
      whitespace gates pass.

## STOP conditions

Stop on a supported direct client caller, Plan 154 not DONE, ownership conflict,
need to weaken fixed-phase authorization, generated type drift, an unexpected
relation outside the characterized graph, or a mandatory gate failing twice.
