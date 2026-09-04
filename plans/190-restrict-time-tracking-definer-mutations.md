# Plan 190: Authorize Time-Tracking Bypass and Break-Type Mutations

> **Executor instructions:** Remove direct client execution of the three
> service-role-backed mutation helpers without changing the maintained Track
> route contracts. Follow every gate and stop rather than broadening access.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/break-types' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/sessions' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/break-types' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / database authorization
- **Depends on:** Plan 154 (BLOCKED); Track/time-tracking and database ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Two bypass helpers can insert a session for an arbitrary workspace/user or
update an arbitrary session while deliberately disabling missed-entry guards.
The default-break helper can rewrite defaults in any caller-selected workspace,
and the underlying break-type table still grants every member direct writes
despite the routes requiring two management permissions. All three functions
are `SECURITY DEFINER`, have no actor check, and inherit PostgreSQL's public
execute privilege, so the protected Track routes are not the real boundary.

## Current state

- `20260206000000_add_bypass_insert_time_tracking_rpc.sql:6-40` defines
  `insert_time_tracking_session_with_bypass`; it trusts every argument and sets
  `time_tracking.bypass_insert_limit` before inserting.
- The same migration at lines 50-87 defines
  `update_time_tracking_session_with_bypass`; it updates solely by
  `p_session_id` after enabling the update bypass and returns the supplied id
  even when no row changed.
- `20251219200314_set_default_break_type_rpc.sql:5-41` clears defaults before
  proving that the target belongs to the workspace. An invalid target can leave
  the workspace without a default.
- `20251219150209_break_tracking.sql:57-101` gives every workspace member
  direct INSERT/UPDATE/DELETE access to `workspace_break_types`; the partial
  unique index prevents two defaults but does not enforce the route capability.
- The Track session and break-type routes first authenticate and authorize,
  then call these functions through `createAdminClient`; the matching live Web
  compatibility routes do the same. No supported caller needs direct
  `anon`/`authenticated` execution.
- `20230202082703_remote_commit.sql:2321-2324` grants newly created public
  functions to `anon`, `authenticated`, and `service_role` by default.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root and nearest
Track/Web/database instructions. Execute from the completed Plan 151/163
integration base only after Plan 154 is green. Inventory all RPC callers again;
do not replace the maintained route permission checks with database trust.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "insert_time_tracking_session_with_bypass|update_time_tracking_session_with_bypass|set_default_break_type" apps packages --glob '!packages/types/src/supabase.ts'` | only the maintained Track/Web route callers and migration/type evidence appear |
| Track routes | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.test.ts'` | existing session authorization behavior passes |
| Break-type routes | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/break-types/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]/route.test.ts'` | ordinary-member denial and authorized CRUD/default behavior pass |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/time-tracking-definer-mutation-permissions.sql` | ACL, zero-row, containment, and atomic-default assertions pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no signature/type drift |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive migration replacing the three function bodies/ACLs
and break-type write policies; `time-tracking-definer-mutation-permissions.sql`;
create the two break-type route suites and extend session characterization only
as required to freeze the trusted calls.

**Out of scope:** changing route response bodies or permissions; changing the
missed-entry threshold; editing generated types; Web/Rust route migration;
break-duration policy; production apply.

## Git workflow

After transfers, use `fix/restrict-time-tracking-definer-mutations` and commit
`fix(track): restrict time tracking definer mutations`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Characterize the three functions' ACLs and every runtime caller. Prove Track
   and Web call them only after their current permission checks and through a
   service-role client. **Verify:** the caller-inventory command has no browser,
   caller-token, or direct authenticated consumer.
2. Add an additive migration that sets a fixed `search_path`, explicitly
   revokes `PUBLIC`, `anon`, and `authenticated`, and grants only
   `service_role`. Preserve signatures so generated types do not change.
   **Verify:** focused pgTAP proves `anon` and `authenticated` cannot execute any
   of the three functions while service role can.
3. Replace break-type write policies so INSERT/UPDATE/DELETE require both
   `manage_workspace_settings` and `manage_time_tracking_requests`, including
   old/new workspace checks on UPDATE; retain member SELECT and service-role
   behavior. Add route tests proving denial occurs before admin mutation and
   authorized cookie/app-session callers keep the current envelope. **Verify:**
   ordinary direct writes fail and authorized policy fixtures succeed.
4. Make both bypass functions fail when no row is inserted/updated and retain
   their bypass scope only for the current transaction. For default selection,
   take a workspace-scoped advisory lock, lock/validate
   `(p_target_id, p_ws_id)` before clearing any other default, and guarantee
   exactly one default after success. Use the installed `extensions.dblink`
   helpers to open two independent workers, send both default RPC calls before
   collecting either result, and assert the final invariant. **Verify:** pgTAP
   proves foreign/missing targets mutate nothing, zero-row update fails, and the
   two-connection race never leaves zero or multiple defaults.
5. Run the focused route/database tests, full disposable database suite,
   no-type-drift check, Track typecheck, repository, and whitespace gates.

## Done criteria

- [ ] Direct anonymous/authenticated execution of all three helpers is denied.
- [ ] Direct break-type writes match the two route management permissions.
- [ ] The maintained service-role route paths retain their current behavior.
- [ ] Missing/foreign targets cannot clear defaults or report false success.
- [ ] Signatures and generated database types do not drift.
- [ ] Focused/full database and repository gates pass.

## STOP conditions

Stop on red Plan 154, an active exact-path owner, any caller that legitimately
uses a caller token, legacy invalid defaults needing a data decision, unexpected
signature/type drift, or inability of the disposable pgTAP harness to open two
independent `dblink` workers; otherwise stop after any mandatory gate fails
twice.
