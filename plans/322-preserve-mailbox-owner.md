# Plan 322: Preserve a Mailbox Owner During Membership Mutations

> **Executor instructions:** Put mailbox membership mutation behind one
> tenant-validating transaction that enforces the frozen owner/admin policy and
> never leaves a mailbox ownerless. Preserve current success shapes.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.ts' 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]/route.ts' apps/mail/src/lib/mail/repository/members.ts apps/database/supabase/migrations apps/database/supabase/tests/private-schema-mail.sql packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on membership schema, response-envelope, Mail owner, or database/type
> owner drift.

## Status

- **Execution status:** BLOCKED — Plans 154/163 and exact Mail/database/type transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / security / tests
- **Depends on:** Plan 154 green, completed Plan 163, Mail/database/type ownership transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

Owners and admins currently use direct service-role upsert/delete operations.
Nothing prevents an admin from assigning/removing owners or concurrent requests
from deleting/demoting the last owner, leaving an active mailbox with no actor
able to administer it.

## Current state and exact contract

- POST and DELETE are exposed by the two member routes at lines 28-48 and 11-24.
  No focused route suite exists.
- `apps/mail/src/lib/mail/repository/members.ts:77-141` permits either owner or
  admin to assign any role and remove any member through separate admin-client
  calls.
- `mail_mailbox_members` in migration
  `20260527115441_create_private_mail_platform.sql:44-54` constrains role names
  and uniqueness only; pgTAP lines 222-234 test only valid role strings.
- Freeze policy:
  - owners may add/update/remove non-owners and promote a member to owner;
  - admins may manage only `admin`, `sender`, and `viewer`, never assign,
    mutate, or remove an owner;
  - a mailbox must retain at least one owner;
  - owner self-demotion/removal is allowed only when another owner already
    exists;
  - missing and foreign-mailbox targets are indistinguishable.
- Add one `private.mutate_mailbox_member(p_actor_id uuid, p_mailbox_id uuid,
  p_target_user_id uuid, p_action text, p_role text default null)` SECURITY
  DEFINER RPC. Lock one mailbox-scoped advisory key before reading membership;
  validate actor/target/role/action and perform the mutation in the same
  transaction. Use fully qualified names and fixed safe `search_path`.
- Typed P0001 messages are exactly `MAILBOX_MEMBER_FORBIDDEN`,
  `MAILBOX_LAST_OWNER`, `MAILBOX_MEMBER_NOT_FOUND`, and
  `MAILBOX_MEMBER_INVALID`. Revoke from PUBLIC/anon/authenticated; grant only
  service_role. Routes map them to 403/409/404/400 respectively and sanitize
  unexpected 500s.
- To avoid a post-commit profile-read failure, resolve/validate the target
  profile before the RPC for upsert; construct the unchanged success response
  from the returned membership plus that profile. DELETE remains 204.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-mail.sql --typegen packages/types/src/supabase.ts` | membership ACL, policy, rollback, and concurrency cases pass |
| Typegen stability | `cp packages/types/src/supabase.ts /tmp/plan322-supabase.ts && bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-mail.sql --typegen packages/types/src/supabase.ts && cmp /tmp/plan322-supabase.ts packages/types/src/supabase.ts` | second generation is byte-identical |
| Mail tests | `bun --cwd apps/mail vitest run src/lib/mail/repository/members.test.ts 'src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]/route.test.ts'` | route/repository matrix passes |
| Mail | `bun type-check:mail && bun --cwd apps/mail run build` | typecheck and app build pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only in-scope paths and plan status changed |

## Scope

**In scope:** one additive Mail migration; `private-schema-mail.sql`; generated
DB types; membership repository; both member mutation routes; focused route and
repository tests.

**Out of scope:** member-list shape, Mail UI controls, mailbox deletion/transfer,
new roles, direct authenticated table access, unrelated Mail repository helpers,
or changing `withMailContext` globally.

## Git workflow

- Branch: `fix/preserve-mailbox-owner` in an isolated worktree; run `bun setup`.
- Migration via `bun sb:new preserve_mailbox_owner`; never edit an old migration.
- Commit: `fix(mail): preserve a mailbox owner`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

1. Add pgTAP red cases for admin-owner escalation/removal, sole-owner mutation,
   self-removal with/without a second owner, invalid actions/roles, foreign
   mailbox targets, direct ACLs, rollback, and two concurrent last-owner
   attempts.
2. Add the exact RPC, lock/validation/policy, typed errors, and ACL in one
   additive migration; run isolated validation and deterministic typegen.
3. Add repository tests, prefetch the target profile, call the RPC once, inspect
   semantic errors, and preserve current returned membership shape.
4. Add route tests for unauthenticated/nonmember/viewer/sender/admin/owner,
   every typed mapping, database error, success, and exact 204 deletion. Run all
   gates.

## Done criteria

- [ ] No supported request or concurrent pair can leave zero owners.
- [ ] Admins cannot assign, mutate, or remove owner membership.
- [ ] The only table mutation path used by these routes is the scoped RPC.
- [ ] ACL, pgTAP, route/repository tests, typegen, Mail build, and `bun check` pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if product policy requires an ownerless mailbox, mailbox deletion uses
member removal as an implicit cascade, another active migration changes these
tables, the profile cannot be validated before mutation without changing the
public response, or the exact owners have not transferred their paths.

## Maintenance notes

All future member mutation surfaces must call this transaction. UI work may
explain last-owner conflicts later, but must not duplicate the invariant in the
client.
