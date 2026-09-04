# Plan 171: Restrict Workspace-User Repair RPCs to Authorized Actors

> **Executor instructions:** Make bulk identity repair service-role-only and
> permit single-user repair only for the same authenticated actor or service
> role. Preserve legitimate idempotent server/self-repair paths and run every
> gate.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/utils/src/workspace-user-link.ts packages/utils/src/workspace-helper.ts packages/education-core/src/teach/api.ts packages/apis/src/finance apps/backend/src/workspace_users_me.rs apps/web/src/legacy-api-routes/v1/workspaces/'[wsId]'/consolidate-users tmp/agent-coordination`
> Caller files are evidence unless a focused test needs updating. Stop on caller
> or ownership drift that changes the actor contract.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / identity integrity
- **Depends on:** Plan 154; database/generated-type and Finance/education coordination
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Two `SECURITY DEFINER` repair functions mutate workspace identity links without
checking the caller and are granted to authenticated clients. One can repair
every workspace when passed `NULL`; the other accepts an arbitrary user and
workspace pair. This bypasses the creator-only HTTP bulk boundary and exposes
identity-link identifiers across tenants.

## Current state

- `apps/database/supabase/migrations/20260503123000_reuse_workspace_user_profiles_for_member_links.sql:65-136`
  defines `consolidate_workspace_user_links(uuid default null)`, reads private
  emails, creates profiles/links, and never calls `auth.uid()`.
- The same migration at lines 139-208 defines
  `ensure_workspace_user_link(uuid, uuid)` and verifies only that the *target*
  user is a member, not that the caller is that user or an administrator.
- Lines 210-211 grant both functions to `authenticated` without revoking
  `PUBLIC`.
- `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/consolidate-users/route.ts:32-75`
  requires the workspace creator and invokes bulk repair through an admin
  client, establishing bulk repair as a privileged server operation.
- Legitimate single-repair callers exist in `packages/utils`,
  `packages/education-core`, `packages/apis`, and future Rust. Admin-backed
  callers must continue to work; actor-backed callers may repair only their own
  verified membership.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'consolidate_workspace_user_links|ensure_workspace_user_link' apps packages --glob '!packages/types/src/supabase.ts'` | every caller is classified as service-role or self-repair |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-user-repair-authorization.sql` | focused pgTAP passes |
| Full database | `bun --cwd apps/database sb:validate:isolated` | full suite exits 0 on Plan 154 baseline |
| Utils tests | `bun run --cwd packages/utils test -- src/workspace-user-link.test.ts` | self/service repair contract passes (create test if absent) |
| API tests | `bun run --cwd packages/apis test -- src/finance/transactions/route.test.ts` | admin repair caller remains green |
| Backend | `bun check:backend` | Rust caller/contract compiles and tests pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Suggested executor toolkit

Load `$tuturuuu-database`, `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, and `supabase`. Read `apps/backend/AGENTS.md` before running
the backend gate.

## Scope

**In scope:** one additive migration; new
`apps/database/supabase/tests/workspace-user-repair-authorization.sql`; focused
caller tests only where the changed contract requires them; README status.

**Read-only evidence:** the historical definitions, generated types, listed
callers, and creator-only consolidation route.

**Out of scope:** changing response types; redesigning workspace profiles or
merge semantics; granting ordinary users bulk/foreign repair; unrelated user
CRUD/RLS from Plan 158; manual generated-type edits; production apply.

## Git workflow

Use `fix/restrict-workspace-user-repair-rpcs`, run `bun setup`, and commit
`fix(users): authorize workspace user repair`. Claim/release the commit window;
do not push unless instructed.

## Steps

### Step 1: Classify every live caller

For each caller in the inventory command, prove whether its Supabase client is
service-role-backed or carries the authenticated actor. Record the matrix in the
focused test comments/coordination note. STOP if any legitimate actor-backed
caller repairs another user; do not broaden the self-repair exception.

**Verify:** every live caller is classified and no unknown cross-user client
remains.

### Step 2: Apply a closed privilege and actor contract

In one additive migration, redefine both functions with their existing
signatures, return values, idempotency, and fixed `search_path` while adding:

- bulk consolidation: service role only; reject `NULL` and arbitrary workspace
  calls from every non-service actor before reading private details;
- single repair: allow service role, or require `auth.uid() = target_user_id`
  plus the existing target membership check;
- explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on bulk and grant
  only `service_role`;
- explicit revoke from `PUBLIC, anon`, then grant `authenticated, service_role`
  on single repair.

Use the repository's established `auth.role()`/service-role function pattern;
do not trust a caller-supplied role or email.

**Verify:** focused migration apply reaches pgTAP without schema errors.

### Step 3: Prove authorization, idempotency, and caller compatibility

Add pgTAP cases for service bulk repair, authenticated bulk rejection including
`NULL`, self-repair success, repeated self-repair returning the same link,
foreign-user rejection, foreign-workspace rejection, anon rejection, and
service-role single repair. Assert denial creates no profile or link row.

Update only focused caller tests needed to prove server and self paths still use
the function correctly.

**Verify:** focused pgTAP, utils/API tests, and `bun check:backend` all pass.

### Step 4: Run full gates

Run the full isolated database suite, `bun check`, and whitespace. If no function
signature changed, confirm generated Supabase types have no diff.

## Done criteria

- [ ] Bulk consolidation is service-role-only, including the `NULL` all-workspace form.
- [ ] Authenticated single repair is limited to `auth.uid()` and a real membership.
- [ ] Service-role and repeated legitimate repairs retain existing behavior.
- [ ] Denied calls cause zero identity-row mutations.
- [ ] Focused/full database, caller, backend, repository, and whitespace gates pass.

## STOP conditions

Stop if Plan 154 is unavailable, a legitimate cross-user actor caller exists,
the migration cannot distinguish service role using a repository-established
pattern, an active owner has not transferred the affected database/caller test,
the function signatures changed, or a mandatory gate fails twice.

## Maintenance notes

Future repair helpers must preserve this distinction: self-repair is actor-bound;
bulk or cross-user repair is a server administration capability, never a generic
authenticated RPC.
