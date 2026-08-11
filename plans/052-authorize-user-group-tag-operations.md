# Plan 052: Authorize User Group Tag Operations

> **Executor instructions:** Apply the existing granular user-group permissions
> consistently and reject cross-workspace tag/group relationships before any
> admin mutation.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/users-core/src/routes/group-tags packages/users-core/src/lib/user-groups 'apps/contacts/src/app/api/v1/workspaces/[wsId]/group-tags'`
> Stop if Contacts ownership or the shared permission helper changed.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `b6cfc860a488d6b986527936b8cf4722c4ffea27`
  on branch `fix/user-group-tag-authorization`; 49 focused tests, Users Core
  and Contacts typechecks, auth guard, `bun check`, Contacts build, and hooks passed
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / Authorization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Only the collection GET/POST checks a named capability. Item and relationship
handlers treat any resolved permission object as authorization, while tag
creation accepts unchecked group UUIDs before an admin insert. A member can
perform unauthorized mutations, and a privileged caller can create a
cross-tenant junction by supplying a foreign group ID.

## Current state

- Collection GET requires `view_user_groups`; POST requires
  `create_user_groups`, but POST has no strict schema or group-workspace check.
- Item GET/PUT/DELETE omit `view_user_groups`, `update_user_groups`, and
  `delete_user_groups` checks.
- Relationship GET/POST/DELETE verify object workspace ownership but omit the
  corresponding view/update permission.
- Contacts and compatibility Web routes reuse these package handlers, so the
  shared package is the correct fix point.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
Contacts notes, confirm the wrappers still re-export these handlers, and use
the satellite-aware `getUserGroupRoutePermissions` path rather than direct
Supabase actor resolution.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared route tests | `bun run --cwd packages/users-core test -- src/routes/group-tags` | all permission and tenant cases pass |
| Shared typecheck | `bun --cwd packages/users-core type-check` | exit 0 |
| Contacts typecheck | `bun type-check:contacts` | exit 0 |
| Auth guard | `node scripts/check-internal-app-auth.js` | no satellite auth regression |
| Repository gate | `bun check` | exit 0 |
| Contacts compile | `bun run --cwd apps/contacts build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/users-core/src/routes/group-tags/route.ts`
- `packages/users-core/src/routes/group-tags/[tagId]/route.ts`
- `packages/users-core/src/routes/group-tags/[tagId]/user-groups/route.ts`
- `packages/users-core/src/routes/group-tags/[tagId]/user-groups/[groupId]/route.ts`
- Focused colocated tests and a small shared validation/access helper if it
  removes duplicated checks

Do not broaden database RLS or move route ownership between apps.

## Git workflow

- Branch: `fix/user-group-tag-authorization` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(contacts): authorize user group tags`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Map methods to existing permissions

Require `view_user_groups` for collection/item/relationship GET,
`create_user_groups` for tag POST, `update_user_groups` for tag PUT and link
POST/DELETE, and `delete_user_groups` for tag DELETE. Preserve 404 for an
unresolved actor/workspace and 403 for a known actor lacking capability.

### Step 2: Validate all input at the boundary

Use strict schemas with UUIDs, bounded names/colors, deduplicated group IDs,
and a conservative maximum relationship count. Reject malformed JSON and
unknown keys before querying or mutating.

### Step 3: Prove tenant ownership before admin writes

For every mutation, load the tag by `(tagId, wsId)` and every supplied group by
`(groupId, wsId)`. Reject the complete request if any ID is foreign or missing;
do not insert the tag or a partial relationship set first.

### Step 4: Keep failure behavior deterministic

Use the admin client only after authorization and validation. Preserve stable
404/409/500 outcomes for missing objects, duplicate links, and database errors,
and avoid returning raw database errors.

## Test plan

For all four handler modules, cover anonymous/app-session actors, each required
permission denied/allowed, foreign tag, foreign group, mixed valid/foreign group
arrays, duplicate IDs, malformed input, and database failure. Assert mutation
mocks are untouched until the full tenant set validates.

## Done criteria

- [ ] Every method requires its established granular capability.
- [ ] Admin writes cannot create cross-workspace tag/group relationships.
- [ ] Invalid batches cause no partial mutation.
- [ ] Shared tests, both typechecks, auth guard, repository gate, and Contacts build pass.

## STOP conditions

Stop if product owners intend tag permissions to differ from user-group
permissions; add a dedicated permission through the normal database/UI rollout
instead of inventing a route-local role.

## Maintenance notes

Keep authorization in the shared package so Contacts and compatibility routes
cannot drift.
