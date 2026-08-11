# Plan 017: Authorize Global IP Denylist Operations

> **Executor instructions:** Replace membership/email shortcuts with the
> Infrastructure satellite's canonical app-session and permission boundary.
> Preserve the denylist data model and block semantics.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/infrastructure/src/app/api/v1/infrastructure/blocked-ips apps/infrastructure/src/lib/infrastructure-admin-access.ts`
> Stop if the route or canonical authorization helper changed materially.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** Security / Infrastructure authorization
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

Implementation is preserved uncommitted in
`.worktrees/fix-infrastructure-blocked-ip-auth`. The focused 17-test suite,
Infrastructure typecheck, `bun check`, and whitespace gate pass. The mandatory
production build remains blocked by the execution environment: after an
approved network retry fetched the required Google font, Turbopack panicked
while processing `packages/ui/src/globals.css` because creating a subprocess
and binding its internal port returned `EPERM`. Do not commit until the same
worktree passes the real build in an environment that permits Turbopack's
worker process.

## Why this matters

The global IP denylist affects every client behind the shared abuse controls.
Its route currently lets any root-workspace member create permanent blocks and
lets either such a member or an exact corporate-domain account remove blocks.
Those shortcuts bypass both the registered Infrastructure app-session actor and
the existing `view_infrastructure` permission boundary.

## Current state

`apps/infrastructure/src/app/api/v1/infrastructure/blocked-ips/route.ts` resolves
callers through a cookie-backed Supabase client, authorizes GET/POST with root
membership, and authorizes DELETE with an email-domain or membership shortcut.
POST permits `block_level: 0`, represented as a 100-year block. The sibling test
at lines 108-133 explicitly proves that a non-staff root member may unblock.

`apps/infrastructure/src/lib/infrastructure-admin-access.ts:8-47` instead
resolves `getSatelliteAppSessionUser('infra')`, evaluates root-workspace
permissions for that actor, and creates the no-cookie admin client only after
authorization. `view_infrastructure` is also the permission used by the
blocked-IP page and other Infrastructure surfaces.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Read the nearest
`AGENTS.md`, run `git status --short`, and confirm no non-terminal note owns the
exact blocked-IP route or authorization helper.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/infrastructure vitest run 'src/app/api/v1/infrastructure/blocked-ips/route.test.ts'` | exit 0; app-session/permission matrix passes |
| Infrastructure typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Infrastructure build | `bun run --cwd apps/infrastructure build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/infrastructure/src/app/api/v1/infrastructure/blocked-ips/route.ts`
- `apps/infrastructure/src/app/api/v1/infrastructure/blocked-ips/route.test.ts`
- `apps/infrastructure/src/lib/infrastructure-admin-access.ts` and its tests
  only if a small reusable helper adjustment is necessary

Do not change block durations, Redis key formats, automatic abuse blocking,
database policies, permission enums, or other Infrastructure routes.

## Git workflow

- Branch: `fix/infrastructure-blocked-ip-auth` in an isolated worktree.
- Conventional Commit: `fix(infrastructure): authorize IP denylist changes`.
- Do not push or open a PR unless instructed. Claim the Git commit window before
  staging or committing; never stage coordination notes.

## Steps

### Step 1: Replace route-local identity shortcuts

Remove `resolveAuthenticatedSessionUser`, `createClient`, the email/root
membership checks, and their helper functions. At the start of GET, POST, and
DELETE call `authorizeInfrastructureAdminRequest('view_infrastructure')` and
return its 401/403 response on failure.

Keep `await connection()` in GET. Use the authorized context's `sbAdmin` for
GET/POST database access and its `user.id` for audit fields. DELETE may keep
using `unblockIP`, but only after canonical authorization succeeds.

**Verify:** denial tests assert zero denylist query, Redis, and `unblockIP`
calls for missing app sessions and callers without permission.

### Step 2: Replace the authorization test matrix

Mock `authorizeInfrastructureAdminRequest`, following a neighboring route that
already uses it. Cover every method for unauthenticated 401, unpermitted 403,
and permitted success. Retain malformed-body, database/Redis or unblock-error,
and finite/permanent block cases. Delete tests that treat email suffix or root
membership without permission as authority. Assert that audit metadata and
`unblockIP` receive the authorized app-session user.

**Verify:** the focused test exits 0 and the route no longer imports the removed
auth/membership helpers.

### Step 3: Run all gates

Run every command in the table. The real Next build is mandatory because this
plan changes an Infrastructure route handler.

## Done criteria

- [ ] Every denylist method requires a valid `infra` app session and
      `view_infrastructure`.
- [ ] Email domain and root membership alone grant no access.
- [ ] Privileged clients and destructive helpers are not reached on denial.
- [ ] Block durations, responses, and Redis behavior remain intact.
- [ ] Focused tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if owners require a new permission distinct from `view_infrastructure`, if
non-satellite automation calls this route, or if an active note claims an
in-scope path. A new permission needs a separate database rollout and must not
be improvised inside this small route fix.

## Maintenance notes

A later audit should migrate remaining cookie-only Infrastructure APIs to the
same satellite-aware helper. That broad conversion is outside this plan.
