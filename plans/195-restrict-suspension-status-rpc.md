# Plan 195: Restrict Suspension Status to Trusted Callers

> **Executor instructions:** Remove the cross-user suspension-status oracle by
> restricting the existing definer RPC to `service_role`. Do not redesign the
> suspension engine or its fail-closed behavior in this plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/utils/src/abuse-protection/user-suspension.ts packages/types/src/supabase.ts`
> Stop if the RPC signature, ACL, or maintained caller has changed materially.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** security / database authorization
- **Depends on:** Plan 154 must restore the green full isolated pgTAP baseline;
  execute from the completed Plan 163 isolated-typegen base
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`public.is_user_suspended(uuid)` is a `SECURITY DEFINER` function whose default
public-schema privileges let anonymous and ordinary authenticated clients query
the active moderation state of any known user UUID. The protected table itself
allows only authorized root administrators and service-role code, so the RPC
currently bypasses the intended confidentiality boundary.

## Current state

- `apps/database/supabase/migrations/20260217110000_add_user_suspensions.sql:21-33`
  defines the unbound definer function; it neither compares `p_user_id` with
  `auth.uid()` nor checks root authorization.
- The same migration at lines 35-66 restricts table access through root
  `manage_workspace_roles` policies and a service-role policy.
- `apps/database/supabase/migrations/20230202082703_remote_commit.sql:2321-2324`
  grants default public-schema function privileges to `anon`, `authenticated`,
  and `service_role`. No later migration revokes the suspension RPC.
- Repository-wide caller search finds only the generated type. The maintained
  server check in `packages/utils/src/abuse-protection/user-suspension.ts:81-94`
  reads the table with the admin client and does not call this RPC.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database
instructions. Confirm Plan 154 is DONE and no active note owns the new migration
or focused test. Use a worktree based on the completed Plan 163 integration
base and run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "is_user_suspended" apps packages --glob '!packages/types/src/supabase.ts'` | only the defining migration/test history and no supported runtime caller |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/user-suspension-rpc-security.sql` | ACL and denial assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | complete pgTAP suite passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/user-suspension-rpc-security.sql` | succeeds and leaves no generated-type diff |
| Type diff | `git diff --exit-code -- packages/types/src/supabase.ts` | no output; ACL-only migration did not change generated types |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive migration created with `bun sb:new`; create
`apps/database/supabase/tests/user-suspension-rpc-security.sql`;
`packages/types/src/supabase.ts` only as a no-diff verification target.

**Out of scope:** Plan 118's tri-state suspension engine; suspension admin UI;
table-policy redesign; changing the RPC signature or result; dropping the RPC;
production database application.

## Git workflow

Use `fix/restrict-suspension-status-rpc` and commit
`fix(database): restrict suspension status rpc`. Claim/release the commit
window; do not push or open a PR.

## Steps

1. Prove with the caller inventory that no supported runtime depends on direct
   anonymous/authenticated RPC access. **Verify:** the exact `rg` command has no
   runtime caller; STOP if one exists until its actor contract is characterized.
2. Create an additive migration that revokes execute from `PUBLIC`, `anon`, and
   `authenticated`, then grants execute only to `service_role`. Preserve the
   function body/signature. **Verify:** focused pgTAP asserts `service_role` can
   execute and both `anon` and `authenticated` cannot.
3. Run focused/full isolated database validation, isolated typegen and the
   separate exact type-diff assertion, repository, and whitespace gates.

## Done criteria

- [ ] Untrusted roles cannot execute `public.is_user_suspended(uuid)`.
- [ ] `service_role` retains the existing boolean contract.
- [ ] No supported runtime caller was broken or silently moved to another
      privileged path.
- [ ] Focused/full pgTAP, typegen no-diff, repository, and whitespace gates pass.
- [ ] Only the scoped migration/test paths changed.

## STOP conditions

Stop on an external/runtime caller, active ownership, Plan 154 not DONE,
generated type drift for this ACL-only migration, any need to weaken Plan 118,
or a mandatory gate failing twice.
