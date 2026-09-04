# Plan 188: Authorize Direct Workspace User-Group Writes

> **Executor instructions:** Split membership-wide ALL policies into the same
> granular read/create/update/delete boundaries enforced by users-core, including
> group-membership co-tenancy.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/users-core/src/routes/user-groups packages/users-core/src/routes/users/groups apps/contacts/src apps/backend/src apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); Contacts/education and database/type transfer; backend/G22 review
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The active policies let every workspace member perform every operation on
groups and group memberships. Ordinary members can bypass users-core's
`create_user_groups`, `update_user_groups`, and `delete_user_groups` checks to
create/delete groups or add/remove learners and managers directly.

## Current state

- `20260701070408_wrap_rls_perf_initplan.sql:1080-1090` retains member-wide
  ALL policies on `workspace_user_groups` and `workspace_user_groups_users`.
- Maintained collection/item routes require `view_user_groups`,
  `create_user_groups`, `update_user_groups`, and `delete_user_groups` by
  operation and use private admin RPCs for writes.
- Member POST/DELETE routes require `update_user_groups`.
- Prepared Rust/Infrastructure exports forward caller credentials and rely on
  these policies for direct reads; service-backed product routes also read them.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Contacts, Teach, users-core, and backend AGENTS. Inventory every direct caller
and obtain backend/G22 review of caller-token read semantics.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-user-group-permissions.sql` | group/member operation matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-user-group-permissions.sql` | no schema-shape drift |
| Users core | `bun run --cwd packages/users-core type-check` | exit 0 |
| Contacts | `bun run --cwd apps/contacts type-check` | exit 0 |
| Backend | `bun check:backend` | caller-token/service-route parity passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive policy/grant migration;
`workspace-user-group-permissions.sql`; generated types only if unavoidable;
focused existing route tests only if caller characterization requires them.

**Out of scope:** route/UI response changes; education course semantics; moving
tables private; group audit-RPC redesign; production cleanup/apply.

## Git workflow

Use `fix/authorize-user-groups` and commit
`fix(contacts): authorize direct user group writes`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Catalog all policies/grants and classify every direct read/write caller.
   Freeze the maintained capability matrix and caller-token Rust exports.
2. Replace group ALL access with operation-specific policies: SELECT requires
   `view_user_groups` (preserving any stronger existing `manage_users` path),
   INSERT requires `create_user_groups`, UPDATE requires
   `update_user_groups`, and DELETE requires `delete_user_groups`. UPDATE must
   validate both old and new workspace.
3. Split membership policies: SELECT requires `view_user_groups`; all membership
   inserts/updates/deletes require `update_user_groups`. Require both the child
   `workspace_users.ws_id` and parent group workspace to match; reject role or
   group moves that cross tenants.
4. Add pgTAP cases for anonymous, ordinary member, each capability, manager,
   member-role changes, foreign child/group, group workspace move, denied delete
   preservation, caller-token reads, and service-role admin writes.
5. Run focused/full DB, typegen, users-core/Contacts/backend, repository, and
   whitespace gates.

## Done criteria

- [ ] Workspace membership alone grants no group or membership mutation.
- [ ] Direct operations match users-core's granular capabilities.
- [ ] Group-member links cannot cross workspaces.
- [ ] Prepared Rust read behavior is reviewed and tested.
- [ ] Focused/full DB, typegen, app/package/backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a supported membership-wide mutation contract,
unmapped caller-token read semantics, legacy cross-tenant rows, type drift, red
Plan 154, default-stack mutation, or a mandatory gate failing twice.
