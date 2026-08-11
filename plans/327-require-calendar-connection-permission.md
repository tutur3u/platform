# Plan 327: Require Calendar Management Permission for Connection Administration

> **Executor instructions:** Make `manage_calendar` the single authorization
> boundary for listing, creating, changing, and deleting workspace Calendar
> connections. Preserve connection payloads, provider-account ownership, and
> current error/cache envelopes. Keep the prepared Rust GET authorization in
> parity while preserving mutation fallthrough. Execute only after Plan 086 has
> established the canonical Calendar permission guard.
>
> **Drift check (run first):**
> `git diff --stat 44742d2ced..HEAD -- 'apps/calendar/src/app/api/v1/calendar/connections/route.ts' 'apps/calendar/src/app/api/v1/calendar/connections/route.test.ts' apps/calendar/src/lib apps/backend/src/calendar_connections.rs apps/backend/src/calendar_connections apps/database/supabase/migrations apps/database/supabase/tests plans/086-enforce-calendar-event-permission.md`
> Stop on connection authorization, Calendar permission-helper, policy, or
> database-test drift.

## Status

- **Execution status:** BLOCKED — Plan 086 plus backend/database ownership transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / correctness / tests
- **Depends on:** Plan 086; Plan 154 green; completed Plan 163; Calendar/backend/database exact-path transfer
- **Planned at:** commit `44742d2ced`, 2026-08-12

## Why this matters

The Calendar dashboard denies members without `manage_calendar`, but the
connection API checks only workspace membership. Any ordinary member can call
the API directly to enumerate provider connection metadata, create calendars,
toggle inbound/outbound/delete synchronization, rename connections, or delete
them. The table's current RLS policies independently grant the same four
operations to every member, so route-only authorization would remain bypassable.

## Current state and exact contract

- `apps/calendar/src/app/[locale]/(dashboard)/[wsId]/page.tsx:34-39` is the
  product contract: callers without `manage_calendar` cannot use Calendar.
- `apps/calendar/src/app/api/v1/calendar/connections/route.ts:58-100` resolves
  cookie or Calendar app-session actors, then `requireWorkspaceAccess` checks
  only `verifyWorkspaceMembershipType`.
- GET at lines 143-193 and POST at 203-330 normalize aliases and reuse that
  membership check. POST then reads a caller-owned active auth token, creates a
  private workspace calendar, and inserts the connection.
- PATCH at lines 340-425 and DELETE at 435-482 first resolve the connection's
  workspace, then allow any member to update synchronization/identity fields or
  delete the row.
- The focused test at
  `apps/calendar/src/app/api/v1/calendar/connections/route.test.ts:35-133`
  covers only GET alias normalization and POST color separation; it mocks
  membership as the authorization result and imports neither PATCH nor DELETE.
- `apps/backend/src/calendar_connections.rs:68-80,82-109,136-164,259-285`
  already owns GET, falls through for POST/PATCH/DELETE, and repeats the
  membership-only boundary before service-role reads for Calendar app sessions.
  RLS alone cannot repair that path; Rust GET must require the same capability.
- `apps/database/supabase/migrations/20251112070314_add_calendar_connections_table.sql:49-78`
  created SELECT/INSERT/UPDATE/DELETE policies using `is_org_member`.
  `20260701070408_wrap_rls_perf_initplan.sql:75-86` is the latest definition
  and still uses membership for all four operations.
- The database permission helper's canonical argument order is
  `public.has_workspace_permission(ws_id, user_id, permission)`; see
  `20251028103417_add_has_workspace_permission.sql:3-38` and the policy pattern
  in `20251210100000_email_audit.sql:98-104`.
- Plan 086 owns the analogous event route/RLS boundary and is required to
  establish one satellite-aware guard. Reuse that guard with explicit
  `user: auth.user` / normalized workspace inputs; do not create a second
  permission engine or resolve ambient cookie auth for app-session callers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new require_calendar_connection_permission` | one additive timestamped migration under `apps/database/supabase/migrations/` |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-connection-permission.sql` | direct SELECT/INSERT/UPDATE/DELETE permission matrix passes |
| Route | `bun --cwd apps/calendar vitest run 'src/app/api/v1/calendar/connections/route.test.ts'` | cookie, app-session, alias, four-method, error, and no-side-effect cases pass |
| Rust | `cd apps/backend && cargo test --lib calendar_connections` | GET permission parity and mutation fallthrough tests pass |
| Backend | `bun check:backend` | Rust formatting, lint, tests, and route checks pass |
| Calendar | `bun --cwd apps/calendar run type-check && bun --cwd apps/calendar run build` | typecheck and production build pass |
| Policy absence | `rg -n 'is_org_member' apps/database/supabase/migrations/<new-migration>.sql` | no membership-only policy expression remains in the replacement migration |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only in-scope paths and plan status changed |

Replace `<new-migration>` with the exact file created by `bun sb:new`; do not
rename or edit historical migrations.

## Suggested executor toolkit

- Load `$tuturuuu-platform`, `$tuturuuu-database`, and
  `$tuturuuu-agent-coordination` before editing.
- Read `apps/calendar/AGENTS.md` if it exists and recheck active ownership.
- Use Plan 086's landed permission helper and tests as the structural exemplar.

## Scope

**In scope:** connection route and its focused test; Plan 086's landed shared
Calendar permission guard only if a narrow reusable export is required; one
additive connection-policy migration; new
`apps/database/supabase/tests/calendar-connection-permission.sql`; prepared Rust
GET handler and focused sibling tests if extraction is needed; plan status.

**Out of scope:** changing connection request/response fields, provider OAuth or
token ownership, synchronization semantics, private-calendar creation
atomicity, event/category policies, generated database types, Rust mutation
methods, TanStack routes, dashboard navigation, or a new permission name.

## Git workflow

- Branch: `fix/calendar-connection-permission` in an isolated worktree; run
  `bun setup` immediately.
- Commit: `fix(calendar): require permission for connections`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Characterize all actors and methods

Expand the existing route test to import GET, POST, PATCH, and DELETE. Add
cookie-session and Calendar app-session actors; UUID and `personal` aliases;
anonymous, nonmember, member-without-permission, permission-lookup-error, and
`manage_calendar` cases. Prove denied actors reach no connection list, auth
token read, private-calendar creation, insert, update, or delete. Preserve the
current 401, 403, 404, 400, 409, 500, success, and GET cache envelopes.

PATCH/DELETE may perform only the existing minimal `id -> ws_id` lookup before
authorization when the body/query supplies only a connection ID. A denied
actor must not receive connection data or reach the mutation. Missing and
foreign IDs retain the current non-disclosing 404 contract.

**Verify:** run the Route command. New red tests must fail against membership-
only behavior before implementation and pass afterward.

### Step 2: Reuse the canonical Calendar permission guard

After Plan 086 lands, reuse its satellite-aware normalized-workspace helper.
Pass the already verified actor explicitly so cookie and Calendar app-session
requests are checked as the same actor the route authenticated. Require
`manage_calendar` after normalization and before any privileged connection,
token, private-calendar, or mutation query. Preserve membership lookup failures
as sanitized 500 and ordinary denial as the settled Calendar 403/404 contract
from Plan 086; do not special-case connection methods.

**Verify:** run the Route command; all four methods must share the same permission
mock/assertion and denied calls must show zero privileged side effects.

### Step 3: Replace the four membership-only RLS policies

Create one additive migration. Drop/recreate (or alter, if the exact PostgreSQL
form safely supports it) the existing SELECT, INSERT, UPDATE, and DELETE
policies so each checks
`public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_calendar')`.
UPDATE must apply the same expression to both `USING` and `WITH CHECK`, preventing
workspace reassignment from bypassing the policy. Preserve service-role access
and existing table grants; do not broaden anon access.

Add pgTAP fixtures for a permitted actor, an ordinary member, a nonmember, and
another workspace. Test direct authenticated SELECT/INSERT/UPDATE/DELETE, the
UPDATE `WITH CHECK` boundary, and service-role maintenance access. Assert the
four policy expressions so later membership-only drift is visible.

**Verify:** run the Database command; every new test passes in the isolated exact-
base database.

### Step 4: Align the prepared Rust GET

Update the prepared Rust GET to evaluate `manage_calendar` for the already
verified cookie or exact-target Calendar app-session actor before any
service-role connection read. Preserve UUID/handle/`personal` normalization,
response body, cache/status behavior, and `None` fallthrough for POST/PATCH/
DELETE. Cover creator, admin, explicit permission, ordinary member, wrong app
target, alias, and permission failure; assert denial performs no connection
fetch. If the current module would approach the 700-line ceiling, extract its
tests/helpers into `apps/backend/src/calendar_connections/` behind stable
exports.

**Verify:** run the Rust and Backend commands and the documented dual-runtime
coverage probe: GET remains covered while mutation methods remain fresh/fallthrough.

### Step 5: Run the full boundary gates

Run route tests, Calendar typecheck/build, isolated database validation,
`bun check`, scope inspection, and whitespace checks. This policy-only migration
must not regenerate `packages/types/src/supabase.ts`.

## Test plan

- Route test: all four methods × cookie/app-session × permitted/ordinary member;
  alias normalization; lookup error; missing/foreign ID; no privileged calls on
  denial; exact current success envelopes.
- pgTAP: all four operations for permitted and denied direct callers, cross-
  workspace denial, UPDATE tenant reassignment denial, service-role continuity,
  and exact policy-expression assertions.
- Rust: cookie and exact-target Calendar app-session GET authorization,
  creator/admin/explicit permission, ordinary-member denial, aliases, lookup
  failure, no post-denial fetch, and mutation fallthrough.
- Structural pattern: Plan 086's landed event permission tests and shared guard.

## Done criteria

- [ ] GET, POST, PATCH, and DELETE require `manage_calendar` for the authenticated actor.
- [ ] Cookie and Calendar app-session actors use the same explicit actor-aware guard.
- [ ] Denied actors reach no privileged query or mutation beyond the minimal ID-to-workspace lookup required for item methods.
- [ ] Direct authenticated RLS denies ordinary members for all four operations and permits `manage_calendar` actors.
- [ ] Prepared Rust GET enforces the same capability and still falls through for mutation methods.
- [ ] Connection payloads, provider-token ownership, status/cache envelopes, and service-role access remain unchanged.
- [ ] Route tests, isolated pgTAP, Rust/backend checks, Calendar typecheck/build, `bun check`, scope, and whitespace gates pass.
- [ ] No generated type file or out-of-scope source is modified.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if Plan 086 is not landed or its guard contract is still unresolved; a
legitimate documented caller intentionally lacks `manage_calendar`; Rust GET
ownership or exact-target app-session behavior cannot be preserved; the
permission helper argument order differs from the current function; connection
policies changed after the planned SHA; an exact route/database owner has not
transferred paths; or any required gate fails twice.

## Maintenance notes

Keep the dashboard, connection API, event/category APIs, and RLS on the same
capability. Adding a new connection method or direct writer requires both route
and policy coverage; a UI-only gate is never sufficient.
