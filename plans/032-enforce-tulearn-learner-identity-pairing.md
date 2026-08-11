# Plan 032: Enforce Tulearn Learner Identity Pairing

> **Executor instructions:** Stop accepting independent platform-user and
> workspace-user learner identities. Derive and enforce the canonical pair from
> `workspace_user_linked_users`, repair or revoke invalid historical rows, and
> revalidate the pair on every parent-subject resolution. Run every gate and
> update this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/learn/src/app/api/v1/workspaces/'[wsId]'/tulearn packages/education-core/src/tulearn apps/database/supabase/migrations apps/database/supabase/tests/tulearn-learner-app.sql packages/types/src/supabase.ts`
> Stop on material parent-link, learner identity, or education schema drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Data integrity / Authorization
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo coordination lanes retain
ownership of generated database types, including
`packages/types/src/supabase.ts`, which this migration must regenerate. The
education extraction note is canonical `done` and is not the blocker.

## Why this matters

Parent links store both a platform learner id and a workspace-user learner id,
but creation verifies only the latter. Parent readers later trust the pair and
mix platform-scoped progress with workspace-user-scoped assignments and marks.
A privileged but mistaken or malicious request can expose one learner's data
under another learner's identity.

## Current state

- `apps/learn/.../tulearn/parent-links/route.ts:17-21` accepts both learner ids
  independently; lines 96-145 validate only workspace-user membership before
  persisting the caller's platform id.
- `packages/education-core/src/tulearn/access.ts:47-81` already resolves the
  canonical pair from `workspace_user_linked_users`.
- `access.ts:117-156` trusts stored parent-link ids without confirming that
  mapping still exists.
- `20260504100000_add_tulearn_learner_app.sql:5-21` has foreign keys and an
  active-link uniqueness key, but no cross-table identity invariant.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`, and
`$tuturuuu-agent-coordination`. Inspect live row counts with redacted aggregate
queries only. Do not automatically rewrite ambiguous identity pairs.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Learn route test | `bun --cwd apps/learn vitest run 'src/app/api/v1/workspaces/[wsId]/tulearn/parent-links/route.test.ts'` | create/read mismatch cases pass |
| Core tests | `bun --cwd packages/education-core vitest run src/tulearn/access.test.ts` | subject-resolution cases pass |
| Typechecks | `bun run --cwd apps/learn type-check && bun run --cwd packages/education-core type-check` | both exit 0 |
| Database apply | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Database types | `bun sb:typegen` | generated Supabase types match the invariant helper |
| Repository gate | `bun check` | exit 0 |
| Learn build | `bun run --cwd apps/learn build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Tulearn parent-link create/list handlers and focused tests
- `packages/education-core/src/tulearn/access.ts` and tests
- One additive migration, updates to
  `apps/database/supabase/tests/tulearn-learner-app.sql`, an integrity audit
  query, and a constrained write helper or trigger/RPC
- `packages/types/src/supabase.ts` after local migration application

Do not build the unfinished invitation acceptance UI, redesign parent roles, or
change unrelated education content authorization.

## Git workflow

- Branch: `fix/tulearn-learner-identity` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(learn): enforce learner identity pairing`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Audit and classify existing pairs

Add a read-only query that joins active/pending parent links to
`workspace_user_linked_users` on workspace, virtual user, and platform user.
Report aggregate valid, missing, and mismatched counts without sensitive
values. If any invalid row exists, stop and obtain an explicit operator-approved
per-category repair, revoke, or quarantine disposition before enforcement.

### Step 2: Derive identity during creation

Remove `studentPlatformUserId` from the route schema and typed callers. Resolve
exactly one linked platform user for `(normalizedWsId,
studentWorkspaceUserId)` before mutation. Reject missing or ambiguous links and
persist only the server-derived id. Apply the same derivation to direct links
and invitation acceptance when that flow is implemented.

### Step 3: Fail closed during parent access

Change `resolveTulearnSubject` to join/revalidate the stored pair against the
canonical link. A stale or mismatched link must not return a subject or perform
admin-backed learner queries. Preserve the existing 403/404 disclosure policy.

### Step 4: Enforce the invariant at the write boundary

Use a constrained security-definer RPC or trigger-backed validation so
service-role callers cannot persist a mismatched triple. Keep grants narrow and
fully qualify objects/search path. Add database tests for valid, cross-workspace,
missing, and mismatched identities; regenerate types after local application.

## Test plan

- Add parent-link route tests modeled on adjacent Tulearn route suites.
- Add subject-resolution tests for valid, missing, revoked, stale, and
  mismatched mappings with negative downstream-call assertions.
- Add database tests that attempt direct service-role invariant violations.

## Done criteria

- [ ] Parent-link callers cannot choose a platform learner id independently.
- [ ] Creation and access both require the canonical three-column identity
      relationship.
- [ ] Existing invalid rows are counted and have an approved repair/revoke
      disposition before enforcement.
- [ ] Service-role writes cannot bypass the invariant.
- [ ] Route/core/database tests, type generation, typechecks, local reset,
      `bun check`, build, and whitespace pass.

## STOP conditions

Stop if the historical audit returns any invalid row without an explicit
operator-approved disposition, if multiple platform users can legitimately map
to one workspace user, or if invite acceptance requires a different identity
contract. Do not guess which learner owns ambiguous data.

## Maintenance notes

The future parent invitation loop should accept a workspace learner reference
only and derive the same canonical identity at acceptance time.
