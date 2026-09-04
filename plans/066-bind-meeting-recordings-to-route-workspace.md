# Plan 066: Bind Meeting Recording Mutations to the Route Workspace

> **Executor instructions:** Fix the live recording-session mutation route so
> its workspace, meeting, and session identifiers form one authorization
> boundary, then lock the corrected PUT/PATCH/DELETE contract with focused route
> and database tests.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.test.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.test.ts' apps/database/supabase/migrations/20250811082156_add_meeting_permissions.sql apps/database/supabase/tests/private-schema-recording-transcripts.sql apps/database/supabase/tests/meeting-recording-session-access.sql apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on recording authorization, route behavior, policy, or migration-artifact
> drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / Tenant containment
- **Depends on:** G22 route/migration artifacts ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route verifies membership in the path workspace but loads the recording
only by meeting and session IDs. A user who belongs to workspace A and the
recording's real workspace B can send `wsId=A` with B's meeting/session IDs:
the A membership check passes and current RLS permits the B mutation because
the actor also belongs to B. The path therefore does not contain the object it
claims to authorize, allowing cross-workspace update or deletion under a false
tenant context.

## Current state

- `route.ts:35-60`, `:123-149`, and `:269-295` authorize membership in the
  normalized route workspace, then fetch the session only by `sessionId +
  meetingId`; none proves `workspace_meetings.ws_id = wsId`.
- `20250811082156_add_meeting_permissions.sql:19-29` grants an authenticated
  member recording-session access through the meeting's actual workspace. That
  RLS boundary does not compare the unrelated route-workspace parameter.
- PUT updates the public session; PATCH writes a private transcript through the
  admin client and separately updates session status; DELETE removes the parent
  session and relies on database cascades. Every branch needs the same
  three-identifier containment check before mutation.
- The exact PUT/PATCH/DELETE path has no Rust handler or explicit override. Its
  generated manifest entry is `legacy-next` with `targetOwner: rust-backend`,
  so moving the live handler requires adding the first-class Web source key to
  the override/backlog registry rather than inventing a Rust port.
- No colocated route test exists. Use
  `meetings/[meetingId]/realtime-token/route.test.ts` for dynamic-route/auth
  fixtures and `users/[userId]/route.test.ts` for separate request/admin
  Supabase chain doubles.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not start while
the G22 lane owns `apps/tanstack-web/migration/route-overrides.json` or the
generated manifest; obtain an explicit handoff or wait for canonical
completion. Recheck that no Rust handler has acquired this exact route before
editing. The Web implementation remains the live source of truth.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route test | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.test.ts'` | all three methods and dual-workspace denial pass |
| Database test | `bun run --cwd apps/database scripts/run-supabase.js test db` | recording RLS/cascade pgTAP cases pass |
| Legacy-wrapper guard | `bun web:api-routes:check` | no generated legacy wrapper is required for the moved route |
| Migration metadata | `bun migration:tanstack:manifest && bun migration:tanstack:check` | re-keyed first-class Web source is current |
| Backend migration guard | `bun check:backend` | exact path remains tracked without silent Rust divergence |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | production build succeeds |
| Whitespace | `git diff --check` | no output |

## Scope

- Replace the generated wrapper with the moved implementation, and create the
  new colocated test at
  `apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts`
  and `route.test.ts`; delete the legacy source as required by
  `bun web:api-routes:check`
- New `apps/database/supabase/tests/meeting-recording-session-access.sql`; use
  `private-schema-recording-transcripts.sql:145-225` and the historical meeting
  policy as read-only fixture exemplars
- Re-key only this route's source entry in
  `apps/tanstack-web/migration/route-overrides.json`, then regenerate
  `route-manifest.json`

Do not change the workspace-member recording policy to creator-only access,
change response bodies, redesign transcript/status atomicity, modify Meet UI,
port the route to Rust, or alter storage/cascade behavior.

## Git workflow

- Branch: `fix/meeting-recording-workspace-boundary` in an isolated worktree;
  run `bun setup` immediately.
- Conventional Commit: `fix(meet): bind recordings to route workspace`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Move the live handler to the first-class API tree

The generated wrapper already occupies the first-class destination. Remove
that tracked wrapper with `git rm --
'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts'`,
then use `git mv --` to move the legacy handler into the now-vacant exact path.
Create its colocated test in the first-class tree. Add the exact first-class
route ID to the migration override registry with `legacy-next` /
`rust-backend` backlog semantics; verify the regenerated manifest drops the
legacy source ID and contains the new one exactly once. If a Rust handler now
owns the exact PUT/PATCH/DELETE path, stop and coordinate a parity plan instead
of silently changing only Web.

### Step 2: Resolve one workspace-bound recording subject

After normalizing `wsId`, authenticating, and proving route-workspace
membership, resolve the meeting with both `meetingId` and `ws_id = wsId`, then
resolve the session under that meeting with `sessionId`. Reuse one helper or
query contract for PUT, PATCH, and DELETE. Return the existing not-found denial
without revealing whether a mismatched meeting/session exists, and perform no
public or private mutation until all three identifiers are bound.

Do not treat membership in the recording's actual workspace as a substitute
for matching the route workspace. Preserve normal access for a member whose
route workspace is the meeting's workspace.

### Step 3: Lock the security boundary and mutation behavior

Build separate request-scoped and admin-client doubles. For each method cover
anonymous, route-workspace nonmember, missing meeting/session, success, and
database failure. Add the decisive actor who belongs to both workspace A and B:
with `wsId=A` and B's meeting/session, PUT/PATCH/DELETE must return the existing
not-found denial and prove no session mutation or transcript upsert occurs.

Retain focused PATCH validation and partial-failure coverage, including invalid
text/duration and transcript/status failures, but document the two-write
ordering as existing debt rather than an atomicity guarantee. DELETE should
issue only the parent-session delete because cascades remain database-owned.

### Step 4: Characterize the underlying RLS separately

Add pgTAP actors for the owning-workspace member, a foreign-only member, the
dual-workspace member, and anonymous. Prove RLS authorizes based on the
meeting's actual workspace and does not know the HTTP path workspace; this
documents why the route-level three-identifier predicate is mandatory. Use
transaction rollback and synthetic UUIDs only.

## Test plan

The Vitest suite exercises the real handler and asserts status/body, exact
workspace/meeting/session filters, client selection, payloads, and no-mutation
denials. The pgTAP suite characterizes the settled RLS boundary rather than
pretending it can validate an HTTP path parameter. Avoid snapshots and mocks
that directly return the expected response.

## Done criteria

- [ ] PUT/PATCH/DELETE bind the recording to the normalized route workspace.
- [ ] A dual-workspace actor cannot substitute workspace A in the path for a
      recording owned by workspace B, and every denial proves no mutation.
- [ ] Normal owning-workspace member behavior and current response shapes remain intact.
- [ ] The handler/test live in the first-class Web API tree and migration metadata is current.
- [ ] Focused Vitest/pgTAP, wrapper/migration/backend guards, Web typecheck,
      `bun check`, Web build, and whitespace pass.
- [ ] Execution changes only the first-class handler that replaces the
      generated wrapper, its new colocated test, removal of the legacy source,
      the new pgTAP file, this route's migration metadata, and the README
      execution-status row.

## STOP conditions

Stop if the G22 owner has not released the migration artifacts, another owner
claims the route, a Rust handler now owns this exact path, current RLS no longer
grants workspace-member access through the owning meeting, historical data
contains a session whose meeting lacks a valid workspace, or the fix requires a
new user-visible response contract. Report the evidence and amend the plan
before broadening scope.

## Maintenance notes

Any future handler or Rust port must preserve the three-part workspace /
meeting / session predicate. A later transactional transcript/status plan may
replace the PATCH partial-write behavior, but must update its tests and
migration metadata together.
