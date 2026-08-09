# Plan 013: Require Nova Role-Management Authorization

> **Executor instructions:** Close the privilege-escalation boundary before
> changing any downstream Nova permissions. Authenticate and authorize before
> parsing the mutation body or creating an unrestricted client.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/nova/src/app/api/v1/nova/users/'[userId]' apps/nova/src/lib/nova-team-api-auth.ts apps/nova/src/lib/challenge-management-auth.ts`
> Stop on any actor, role, or route-contract drift.

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Nova authorization
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The Nova user-role endpoint uses an admin client to update or delete arbitrary
`platform_user_roles` rows without resolving the caller or requiring role
management. The generic API proxy supplies session refresh and abuse controls,
not endpoint authorization. Any ordinary valid Nova app-session caller can
therefore grant themselves global challenge/role privileges or revoke another
user's access.

## Current state

`apps/nova/src/app/api/v1/nova/users/[userId]/route.ts:4-38` takes its mutation
target from the request body rather than the path:

```ts
const { userId, enabled, allow_role_management, ...rest } = await req.json();
const sbAdmin = await createAdminClient();
await sbAdmin.from('platform_user_roles').update(updateData).eq('user_id', userId);
```

DELETE at lines 51-69 takes the path ID but likewise creates the admin client
and deletes without caller authorization. The existing canonical boundary is
`authorizeNovaRoleManager` in `apps/nova/src/lib/nova-team-api-auth.ts`: it
resolves the registered Nova app-session actor, creates the injectable admin
client only after authentication, and requires both `enabled` and
`allow_role_management`. Its test and
`apps/nova/src/app/api/v1/nova/teams/[id]/members/route.test.ts` demonstrate the
expected discriminated-result and negative-call patterns.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route test | `bun --cwd apps/nova vitest run 'src/app/api/v1/nova/users/[userId]/route.test.ts'` | exit 0; authorization and strict-body matrix passes |
| Nova typecheck | `bun --cwd apps/nova run type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Nova build | `bun --cwd apps/nova run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/nova/src/app/api/v1/nova/users/[userId]/route.ts`
- New sibling `route.test.ts`
- `apps/nova/src/lib/nova-team-api-auth.ts` and its test only if a small response
  helper must be exported; prefer the existing public authorization function

Do not change role meanings, database schema, role-management UI, challenge
manager assignment, or other Nova endpoints.

## Git workflow

- Branch: `fix/nova-role-management-auth` in an isolated worktree.
- Conventional Commit: `fix(nova): authorize role mutations`.
- Do not push/open a PR unless instructed. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Freeze the request contract with tests

Add a route test modeled on the team-members route test. Cover anonymous,
enabled-but-unprivileged, disabled role-manager, authorized role-manager,
malformed JSON, missing path ID, body/path mismatch or body `userId`, unknown
fields, database failure, and successful PUT/DELETE.

**Verify:** before implementation, denial tests demonstrate the current gap;
after each next step, rerun the focused file and require all cases to pass.

### Step 2: Authorize before privilege or body parsing

Change both handlers to accept the actual request and route params. Call
`authorizeNovaRoleManager(request)` first. Return its 401/403 response directly
on denial. Use the authorized context's existing admin/private client; do not
call `createAdminClient` separately. Only then parse PUT JSON.

**Verify:** anonymous/unprivileged tests return 401/403 and assert zero body
parse and zero `platform_user_roles` query/mutation calls.

### Step 3: Use one target identity and a strict payload

Use only `params.userId` as the mutation target. Validate it as a UUID and parse
PUT through a strict Zod object containing exactly the four boolean role flags:
`enabled`, `allow_challenge_management`, `allow_manage_all_challenges`, and
`allow_role_management`. Reject a body `userId`, unknown fields, missing
booleans, and wrong types with 400. Do not silently default omitted privileges
to false.

**Verify:** the update mock receives the exact four fields and `.eq('user_id',
pathUserId)`; no caller-supplied target reaches the query.

### Step 4: Keep errors non-sensitive and behavior explicit

Return the existing success status/body. Replace the PUT response that exposes
`error.message` and the unrelated DELETE “AI Models” error with stable role
mutation errors. Preserve server-side `console.error` severity without logging
request bodies or identities beyond existing safe operational context.

**Verify:** database-error tests return sanitized 500 bodies and the success
tests return 200 only after the targeted mutation resolves without error.

### Step 5: Run all gates

Run every command in the table in order. Expected: all Bun commands exit 0 and
`git diff --check` prints nothing.

## Done criteria

- [ ] Anonymous, disabled, and non-role-manager callers cannot mutate roles.
- [ ] Authorization occurs before body parsing or privileged database access.
- [ ] The path UUID is the only accepted target identity.
- [ ] PUT accepts exactly four explicit boolean flags and rejects extra fields.
- [ ] Error responses do not expose database messages or unrelated copy.
- [ ] Focused tests, typecheck, `bun check`, Nova build, and whitespace pass.

## STOP conditions

Stop if role administration intentionally belongs to a different Nova
permission, if a bootstrap flow needs to create the first role manager, or if
the route is invoked without a registered Nova app session. Specify a separate,
auditable bootstrap contract rather than weakening this endpoint.

## Maintenance notes

All future `platform_user_roles` writers must use a server-side role-management
boundary. Reviewers should verify negative cases do not construct a service-role
client and that target IDs never come from both path and body.
