# Plan 081: Constrain Group Post Recipients

> **Executor instructions:** Bind group checks, approvals, reads, and email
> delivery to users who actually belong to the post's group. Do not execute
> through active daily-report or migration-artifact ownership.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'packages/users-core/src/routes/user-groups/[groupId]/group-checks/route.ts' 'packages/users-core/src/routes/user-groups/[groupId]/group-checks/[postId]/route.ts' packages/users-core/src/routes/users/approvals/put.ts 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks' 'apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks' 'apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks' apps/web/src/lib/post-email-queue/queue-core.ts apps/web/src/lib/post-email-queue/queue-core.test.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on recipient, approval, queue, or route-ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / tenant data isolation
- **Depends on:** daily-report queue ownership and G22 migration-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Admin-backed check mutations accept arbitrary workspace-user IDs without proving
membership in the post's group. Approval and email delivery preserve that gap,
so a same-workspace off-group user can become eligible to receive confidential
group post content.

## Current state

- Both group-check mutation routes scope the post but not each supplied user to
  `workspace_user_groups_users` for `groupId`.
- `packages/users-core/src/routes/users/approvals/put.ts` scopes the post only to
  the workspace before approving a check.
- `apps/web/src/lib/post-email-queue/queue-core.ts` selects approved recipients
  by post/workspace/email without requiring current membership in the post's
  group.
- The daily-report handoff owns the queue core/tests; G22 owns the migration
  manifests required by any substantially reworked Web route.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-database` if a database invariant is added. Inspect active ownership,
run `git status --short`, and do not edit until both blockers are released or
the exact paths are transferred.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Users-core tests | `bun run --cwd packages/users-core test -- 'src/routes/user-groups/[groupId]/group-checks/route.test.ts' 'src/routes/user-groups/[groupId]/group-checks/[postId]/route.test.ts' src/routes/users/approvals/put.test.ts` | off-group and cross-workspace denials plus valid-member success pass |
| Web route/queue tests | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/route.test.ts' src/lib/post-email-queue/queue-core.test.ts` | both live mutations and delivery enforce membership |
| Contacts ownership tests | `bun --cwd apps/contacts vitest run 'src/app/api/v1/workspaces/[wsId]/user-groups/route-ownership.test.ts'` | satellite wrappers retain the shared contract |
| Users-core types | `bun run --cwd packages/users-core type-check` | exit 0 |
| App builds | `bun run --cwd apps/web build && bun run --cwd apps/contacts build` | both live consumers compile |
| Migration metadata | `bun migration:tanstack:manifest && bun migration:tanstack:check` | changed Web routes remain tracked |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/users-core/src/routes/user-groups/[groupId]/group-checks/route.ts`
- `packages/users-core/src/routes/user-groups/[groupId]/group-checks/[postId]/route.ts`
- `packages/users-core/src/routes/users/approvals/put.ts`
- focused users-core tests named in the command table
- the two legacy Web group-check handlers and existing collection test, moved
  collision-safely with a new post-specific test to the corresponding
  `apps/web/src/app/api/**` first-class paths
- the two generated first-class wrappers are removed before those `git mv`
  operations; no legacy implementation remains afterward
- Contacts wrappers and `route-ownership.test.ts` only if imports/contract
  assertions require an update
- `apps/web/src/lib/post-email-queue/queue-core.ts` and its test
- the two exact re-keyed route overrides and regenerated route manifest
- `plans/README.md` only for status

Do not change post visibility, approval roles, email copy, or group membership
management.

## Git workflow

Use branch `fix/group-post-recipient-containment` in an isolated worktree and
run `bun setup`. Commit `fix(users): constrain group post recipients`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the authorization matrix

Cover an actual group member, a same-workspace off-group user, a cross-workspace
user, a removed member, duplicate IDs, and a missing post. Prove denied inputs
cannot invoke the admin mutation or become queue recipients.

### Step 2: Centralize recipient containment

Add one injectable server helper or private RPC that resolves the scoped post's
group and validates every requested workspace-user ID against that group before
any upsert, delete, or approval. Reject the whole request atomically if any ID
is invalid; never silently drop invalid recipients.

Apply the same helper to both maintained users-core/Contacts handlers and the
live Web handlers. For each Web route, first remove its generated first-class
wrapper, then `git mv` the legacy implementation and colocated test into that
vacant first-class path; create the missing post-specific test there. Re-key
both exact override IDs and regenerate the manifest.

### Step 3: Apply the same boundary to reads and delivery

Filter check reads and email recipient selection through the same group
membership relation. Define removed-member behavior explicitly: removed users
must not receive future delivery even if an older check remains approved.

### Step 4: Audit historical invalid rows

Run this read-only query locally and in staging and require zero rows; the
production operator must run the same query before rollout and attach the
redacted row count to the execution handoff:

```sql
select c.post_id, c.user_id, p.group_id
from public.user_group_post_checks as c
join public.user_group_posts as p on p.id = c.post_id
left join public.workspace_user_groups_users as m
  on m.group_id = p.group_id and m.user_id = c.user_id
where m.user_id is null;
```

If it returns rows, mark the plan blocked and require an operator-approved
quarantine/delete/preserve disposition in the execution coordination note; do
not modify historical data implicitly.

### Step 5: Verify all callers and migration tracking

Run focused suites, types, the real Web build, migration manifest/check, and
`bun check`. Inspect the final diff for unrelated queue or Users work.

## Done criteria

- [ ] Every check recipient is a current member of the post's group.
- [ ] Off-group and cross-workspace IDs fail before privileged writes.
- [ ] Approval and delivery revalidate the same containment invariant.
- [ ] The production audit records either zero invalid rows or an approved disposition.
- [ ] Focused tests, both app builds, migration tracking, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership remains active, historical invalid rows exist without an
approved disposition, the post/group relation is ambiguous, or a required gate
fails twice.

## Maintenance notes

Workspace membership is not a substitute for group membership. Any future
delivery path must join recipients through the content's owning group.
