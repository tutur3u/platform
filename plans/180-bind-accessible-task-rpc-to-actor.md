# Plan 180: Bind Accessible-Task RPCs to the Authenticated Actor

> **Executor instructions:** Make `get_user_accessible_tasks` reject caller-
> selected identities and foreign workspaces while preserving trusted server
> callers and the current result shape.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tasks/src/app/api/v1/mira packages/ai/src/tools packages/tasks-ui/src/calendar apps/web/src/legacy-api-routes/v1/live apps/backend/src/mira_tasks.rs tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / authorization / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); Tasks, database, and generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The public `SECURITY DEFINER` RPC accepts any `p_user_id` and optional
`p_ws_id` without comparing them with the caller. An authenticated actor can
therefore request another user's assigned tasks or point the personal-workspace
branch at a foreign workspace and receive task names and descriptions.

## Current state

- `20260212163901_update_rpc_overrides.sql:8-168` defines the six-argument
  function, grants it to `authenticated`, and performs no caller check.
- A null workspace resolves the personal workspace for caller-selected
  `p_user_id`; a supplied personal workspace returns that workspace's tasks
  plus the selected user's assignments across all workspaces.
- Maintained callers pass the intended actor explicitly. Some invoke through a
  caller session and some through a trusted admin client, so a blanket
  `p_user_id = auth.uid()` rule would break legitimate server orchestration.
- The return columns and all six input parameters are a maintained contract.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database
AGENTS. Start from the completed Plan 151/163 base only after Plan 154 is green.
Inventory every overload, ACL, and caller before writing SQL.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/accessible-task-rpc-actor.sql` | actor/workspace matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/accessible-task-rpc-actor.sql` | no signature drift |
| Tasks | `bun run --cwd apps/tasks type-check` | exit 0 |
| AI | `bun run --cwd packages/ai type-check` | exit 0 |
| Backend | `bun check:backend` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive hardening migration; `accessible-task-rpc-actor.sql`;
generated types only if unavoidable; caller files as read-only contract evidence.

**Out of scope:** response/projection changes; task pagination; route migration;
new workspace/share semantics; production apply; repairing unrelated pgTAP.

## Git workflow

Use `fix/bind-accessible-task-rpc` and commit
`fix(tasks): bind accessible task RPC to actor`. Claim/release the commit window;
do not push or apply production migrations.

## Steps

1. Catalog every signature, grant, and TypeScript/Rust caller. Classify each
   invocation as caller-JWT or service-role and prove every caller supplies the
   authenticated actor rather than a target identity.
2. Replace the function without changing its signature or result columns.
   Revoke `PUBLIC` and `anon`; grant only `authenticated` and `service_role`.
   For an authenticated JWT, require non-null `auth.uid()` equal to
   `p_user_id`. Permit the trusted service role to retain the explicit actor
   parameter for current server callers.
3. For authenticated calls, require a null workspace to resolve only that
   actor's personal workspace. Require an explicit personal workspace to be
   that actor's personal workspace, and a team workspace to be accessible
   under the current membership/share contract characterized in Step 1. Fail
   closed when the workspace is absent, deleted, foreign, or ambiguous.
4. Add pgTAP cases for anonymous, cross-user, foreign personal, foreign team,
   deleted workspace, self personal, member team, established guest/share
   access if supported, and service-role actor calls. Assert denied calls
   disclose no task row.
5. Run focused/full disposable database validation, isolated typegen, caller
   typechecks, backend verification, repository, and whitespace gates.

## Done criteria

- [ ] Public callers cannot choose another user or foreign workspace.
- [ ] Trusted current server callers retain the exact six-argument/result contract.
- [ ] `PUBLIC` and `anon` cannot execute the function.
- [ ] Focused/full DB, typegen, Tasks, AI, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, an undocumented caller that intentionally queries a
target user, unclear guest/share semantics, required signature/response drift,
unexpected typegen drift, a red Plan 154 baseline, or a gate failing twice.
