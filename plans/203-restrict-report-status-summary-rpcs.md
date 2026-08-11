# Plan 203: Restrict Report Status Summaries to Authorized Server Callers

> **Executor instructions:** Close direct public execution of the monthly-report
> group/user summary functions while preserving the maintained TypeScript and
> Rust service-role routes.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/users-core/src/routes/users/reports/groups 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/reports/groups' apps/backend/src/workspaces_users_reports_groups apps/backend/src/workspaces_users_reports_groups_groupid_dashboard.rs apps/backend/api/openapi.d tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** security / reporting authorization
- **Depends on:** Plans 154 and 163; daily-report and database ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from the eventual
  green Plan 154 result incorporating reviewed Plan 163 commit `3f61e928ea`

## Why this matters

The definer functions disclose arbitrary tenants' group IDs, workspace-user
IDs, and pending/approved/rejected report activity. Maintained routes enforce
`view_user_groups_reports` and group membership, but direct Data API execution
bypasses those checks.

## Current state and exact contract

- `20260531200539_move_external_user_monthly_reports_private.sql:481-529`
  defines `get_group_report_status_summary(uuid)` and
  `get_user_report_status_summary(uuid,uuid)` as caller-unchecked
  `SECURITY DEFINER` functions.
- TypeScript users-core routes and the extant live Web legacy compatibility
  routes call them through `sbAdmin` only after permission and own-group checks.
  Prepared Rust report handlers also use service role; caller-token execution is
  not a supported direct RPC contract.
- Revoke both exact signatures from `PUBLIC`, `anon`, and `authenticated`; grant
  only `service_role`. Preserve result columns, status counting, filtering, and
  route/OpenAPI responses exactly.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$supabase-postgres-best-practices`,
`$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read database, users-core/Contacts, and backend AGENTS files. Obtain the
daily-report/database transfer and a backend owner review. Inventory all RPC
callers and STOP if any maintained Rust request forwards a caller token to
either function.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/report-status-summary-rpc-privileges.sql` | anon/auth denials and service-role projections pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP suite passes |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/report-status-summary-rpc-privileges.sql` | focused test passes |
| No type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no output |
| Users core | `bun --cwd packages/users-core vitest run 'src/routes/users/reports/groups/route.test.ts' 'src/routes/users/reports/groups/[groupId]/dashboard/route.test.ts'` | new tests prove permission/group checks precede exact admin RPC calls |
| Users-core typecheck | `bun run --cwd packages/users-core type-check` | exit 0 |
| Rust focused | `cd apps/backend && cargo test workspaces_users_reports_groups::tests` | named new tests exercise both group-list and group-dashboard handlers and assert service-role authorization headers on both RPC requests |
| Backend contract | `bun check:backend` | Rust/OpenAPI parity passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive ACL migration; one focused pgTAP file; new users-core
`groups/route.test.ts` and `[groupId]/dashboard/route.test.ts`; new
`apps/backend/src/workspaces_users_reports_groups/tests.rs` registered from that
module and covering both the modular group-list handler and the crate-level
group-dashboard handler. The live Web legacy routes are caller-inventory
evidence only unless a test is required to prove their existing admin client.

**Read-only evidence:** users-core authorization, prepared Rust callers, and
OpenAPI. **Out of scope:** changing report counts, report permissions, group
membership rules, response bodies, page UI, generated types, or production
apply.

## Steps

1. Prove every maintained users-core, live Web compatibility, and Rust caller
   authenticates/authorizes first and invokes the RPC through service role. Add
   the two named users-core tests for denial-before-admin and exact RPC args.
   Add the named Rust test module with mocked outbound requests for both
   handlers, asserting the service-role bearer/header rather than the caller
   token reaches both summary RPCs. Freeze response parity.
2. Add signature-specific revoke/grant statements for both functions without
   replacing their bodies.
3. In pgTAP, assert privilege inventory and actual anonymous/authenticated
   denial for foreign workspace/group fixtures; assert service role still
   returns the expected group/user counts and cannot cross the supplied
   workspace predicate.
4. Run focused/full isolated DB validation, no-diff typegen, users-core and Rust
   gates, `bun check`, and whitespace verification.

## Done criteria

- [ ] Direct anonymous/authenticated execution is impossible for both RPCs.
- [ ] Users-core permission and own-group behavior remains unchanged.
- [ ] Prepared Rust service-role handlers retain response parity.
- [ ] Full database, backend, no-type-drift, repository, and whitespace gates pass.

## STOP conditions

Stop if Plan 154 is not green, ownership/review is unavailable, any supported
caller-token path depends on direct execution, response semantics drift,
generated types change, or a mandatory gate fails twice.
