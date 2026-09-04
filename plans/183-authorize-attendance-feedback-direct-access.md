# Plan 183: Authorize Direct Attendance and Feedback Access

> **Executor instructions:** Replace the existence-only all-operation policies
> on attendance and feedback with tenant- and permission-aware access that
> preserves maintained admin-backed routes.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/users-core/src/routes/user-groups apps/contacts/src apps/teach/src apps/web/src/legacy-api-routes/v1/workspaces apps/infrastructure/src apps/backend/src apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); Contacts/education and database/type transfer; backend/G22 contract review
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Authenticated users can directly perform every operation on
`user_feedbacks` and `user_group_attendance` whenever the referenced rows
exist. This bypasses the maintained `view_user_groups`,
`update_user_groups_scores`, and `check_user_attendance` permission boundaries
and permits forged feedback creators or unauthorized attendance changes.

## Current state

- `20230918111058_add_temp_tables_for_migration.sql:92-161` creates identical
  permissive ALL policies that only test whether user/group ids exist.
- Maintained feedback routes require view or score-update permission before
  admin writes. Maintained attendance routes require view or attendance-check
  permission and use admin/RPC persistence.
- Several live server components and compatibility routes read these tables
  through admin clients. Direct authenticated callers must be inventoried
  before tightening SELECT or writes.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Contacts, Teach, backend, and nearest users-core AGENTS. Resolve the
nonarchived education note and active database/type ownership; coordinate a
read-only contract review with backend/G22. Inventory every table caller and
its client role, including the caller-token Infrastructure export handlers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/attendance-feedback-permissions.sql` | tenant/permission matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/attendance-feedback-permissions.sql` | no schema-shape drift |
| Users core | `bun run --cwd packages/users-core type-check` | exit 0 |
| Contacts | `bun run --cwd apps/contacts type-check` | exit 0 |
| Teach | `bun run --cwd apps/teach type-check` | exit 0 |
| Backend | `bun check:backend` | caller-token export tests and full backend checks pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive policy/grant migration;
`attendance-feedback-permissions.sql`; generated types only if unavoidable;
focused route tests only if caller inventory proves a current session-client
contract needs characterization.

**Out of scope:** response/UI changes; attendance session redesign; feedback
scoring semantics; moving tables private; production cleanup/apply.

## Git workflow

Use `fix/authorize-attendance-feedback` and commit
`fix(contacts): authorize attendance and feedback`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Catalog every SELECT/INSERT/UPDATE/DELETE caller and classify admin,
   service-role, and caller-session clients. Freeze legitimate direct-read
   behavior before changing policy.
2. Replace each ALL policy with separate policies. Require the referenced user
   and group to share the same workspace. SELECT must require the maintained
   view capability. Feedback mutations require the score-update capability;
   attendance mutations require the attendance-check capability. For direct
   feedback inserts, require `creator_id` to equal the actor's
   `workspace_user_linked_users.virtual_user_id` mapping in that same workspace;
   never compare the platform `auth.uid()` directly with the CRM user id.
3. Preserve trusted admin/service persistence used by maintained routes. If a
   live session client legitimately writes without those permissions, stop and
   reconcile the product contract rather than grandfathering existence-only access.
4. Add pgTAP cases for anonymous, ordinary member, viewer, score manager,
   attendance manager, cross-workspace user/group pairs, forged creator,
   update/delete, and service-role routes. Prove denied destructive operations
   leave rows intact.
5. Run focused/full DB, typegen, owning package/app typechecks, backend,
   repository, and whitespace gates.

## Done criteria

- [ ] Existence of referenced rows is never sufficient authorization.
- [ ] User and group are always co-tenant.
- [ ] Direct read/write permissions match maintained route capabilities.
- [ ] Focused/full DB, typegen, package/app, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, undocumented direct-session semantics, inability to
map a caller to a canonical permission, legacy cross-tenant rows, unexpected
typegen drift, a red Plan 154 baseline, or a gate failing twice.
