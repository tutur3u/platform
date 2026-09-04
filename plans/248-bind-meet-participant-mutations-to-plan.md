# Plan 248: Bind Meet Participant Mutations to One Plan

> **Executor instructions:** Close both caller-controlled cross-plan mutation
> paths in the legacy Meet server actions. Make guest availability validation
> fail closed and make creator-driven participant cleanup one plan-scoped
> transaction. Preserve the current UI and successful response envelopes.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/apis/src/meet/actions/timeblocks.ts packages/apis/src/meet/actions/timeblocks.test.ts packages/apis/src/meet/actions/users.ts packages/apis/src/meet/actions/users.test.ts packages/ui/src/components/ui/legacy/meet/planId/plan-user-filter-accordion.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — execute from completed Plan 163 only after
  Plan 154 restores the full isolated pgTAP baseline and database/generated-
  type ownership transfers
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / correctness / test coverage
- **Depends on:** Plans 154 and 163; database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

A guest credential is issued for one Meet plan, but availability creation
currently validates only the guest UUID and password hash before an admin write
to a caller-selected plan. Separately, a plan creator can pass a guest UUID from
another plan to participant removal and delete that guest's votes globally.
Both paths violate the plan boundary, and participant removal can also commit
only its first cleanup steps before returning an error.

## Current state and exact contract

- `packages/apis/src/meet/actions/timeblocks.ts:68-77` reads only
  `is_confirmed`, discards the query error, and blocks only when the returned
  row is truthy and confirmed. Missing plans and lookup failures therefore
  continue into writes.
- `timeblocks.ts:126-151` validates a guest by `id` plus `password_hash` but
  omits `plan_id`, then inserts through the service role with the supplied
  `planId`. The guest delete branch later in the same file already shows the
  correct three-field lookup: `plan_id`, `id`, and `password_hash`.
- `packages/apis/src/meet/actions/users.ts:20-38` proves only that the actor
  created `planId`. Lines 42-67 then delete user timeblocks, guest timeblocks,
  and every `poll_guest_votes` row whose `guest_id` equals the caller-selected
  UUID, without proving that guest belongs to the plan or that the vote's poll
  belongs to the plan.
- `apps/database/supabase/migrations/20240205033319_add_initial_plan_timeblocks_support.sql:35-50`
  gives guest timeblocks independent foreign keys to a plan and guest.
  `20250722170914_refine_poll_schema.sql:264-270` likewise gives guest votes
  independent guest and option foreign keys. Neither relation enforces
  co-plan ownership.
- The platform-user removal behavior has no durable participant row: deleting
  that user's timeblocks from the selected plan is the existing meaning.
  Preserve it. A guest participant is identified by a
  `meet_together_guests(id, plan_id)` match; remove only that verified plan's
  guest timeblocks and votes. Do not delete the guest account or affect another
  plan.
- Plan lookup failure or absence in create/delete availability returns the
  existing generic plan failure `{ error: 'Plan not found' }`; a confirmed plan
  retains the existing confirmed-plan message. A guest credential from another
  plan returns the existing `{ error: 'Unauthorized' }` before any write.
- Add one service-role-only RPC with exact signature
  `private.remove_meet_plan_participant(p_plan_id uuid, p_target_user_id uuid,
  p_actor_user_id uuid) returns jsonb`. It locks the plan, requires its
  `creator_id = p_actor_user_id`, rejects creator self-removal, classifies the
  target as the guest belonging to that plan when such a row exists, and then
  atomically deletes only selected-plan user timeblocks, selected-plan guest
  timeblocks, and guest votes whose option joins through `poll_options -> polls`
  to `polls.plan_id = p_plan_id`. Return counters plus `participant_kind`
  (`guest` or `user`) in the JSON for tests; the action keeps its existing
  success envelope.
- Raise exact `P0001` messages `MEET_PLAN_NOT_FOUND`,
  `MEET_PLAN_FORBIDDEN`, and `MEET_PLAN_SELF_REMOVE`. Map them to the current
  action errors (`Plan not found`, `Only the plan creator can remove users`,
  and `Cannot remove yourself from the plan`). Unclassified failures retain
  `Error removing user from plan`.
- Revoke the exact RPC signature from PUBLIC, `anon`, and `authenticated`; grant
  only `service_role`. Do not broaden existing direct table policies.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS and current Supabase RLS guidance. Execute
from completed Plan 163 only after Plan 154 is green. The canonical Meet
realtime note is `done` and is not an ownership lock; still inspect current
top-level notes before claiming these exact paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'createTimeblocks\(|deleteTimeblock\(|removeUserFromPlan\(' apps packages --glob '!plans/**'` | every supported caller is classified; no second mutation implementation is missed |
| Action tests | `bun --cwd packages/apis vitest run src/meet/actions/timeblocks.test.ts src/meet/actions/users.test.ts src/meet/actions/polls.test.ts` | cross-plan, lookup-error, confirmed, atomic cleanup, mappings, and existing poll cases pass |
| Database focused/full | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/meet-participant-plan-boundary.sql && bun --cwd apps/database sb:validate:isolated` | co-plan cleanup, rollback, ACL, and full baseline pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/meet-participant-plan-boundary.sql` | generated RPC types are current with no unrelated drift |
| Types | `bun run --cwd packages/apis type-check && bun run --cwd packages/ui type-check` | exit 0 |
| Repository | `bun check && git diff --check` | all gates pass; whitespace output is empty |

## Scope

**In scope:** the two Meet action modules and new focused tests; the legacy
Meet participant accordion only if its call signature must carry an already-
available participant discriminator; one additive migration and pgTAP file;
generated database types only when isolated typegen changes them.

**Out of scope:** poll creation/voting semantics; plan editing or confirmation;
guest login/password design; deleting guest accounts; changing participant UI,
messages, or successful envelopes; broad Meet schema/RLS redesign; production
migration apply; Rust/TanStack work (these are package server actions, not API
route handlers).

## Steps

1. Add red action tests for missing/error/confirmed plan reads, valid guest,
   same credential against a foreign plan, and no-write-on-denial. Add user
   removal tests for foreign guest UUID, creator/self checks, RPC success and
   each named failure mapping.
2. Make availability plan lookup inspect both `data` and `error` before cleaning
   input or constructing inserts. Add `.eq('plan_id', planId)` to guest
   credential resolution for create, matching the existing delete branch.
3. Create the exact transactional RPC and ACLs. Lock and authorize the plan
   inside the transaction; plan-scope every delete, including guest votes via
   option and poll joins. A forced exception after each delete stage must roll
   back every earlier deletion.
4. Replace `users.ts` direct admin deletes with the RPC. Preserve the existing
   action signature unless caller characterization proves a discriminator is
   needed; if so, pass the existing `user.is_guest` from the accordion without
   changing rendered behavior.
5. Add pgTAP fixtures for two plans, creators, platform users, guests, polls,
   options, votes, and timeblocks. Prove foreign guest and foreign vote rows are
   untouched, selected-plan rows commit together, injected failure rolls back,
   creator/self rules hold, and only service role can execute the RPC.
6. Run focused/full database, isolated typegen, package/UI typechecks,
   repository, whitespace, source-size, and exact-scope gates.

## Done criteria

- [ ] A guest credential can create/delete availability only in its own plan,
      and plan read failures cannot fail open.
- [ ] A creator cannot remove a foreign-plan guest or delete any foreign-plan
      vote/timeblock through a supplied UUID.
- [ ] Selected-plan participant cleanup is one transaction and fault injection
      leaves all rows intact.
- [ ] The RPC is service-role-only; current successful/error action envelopes
      and platform-user semantics remain stable.
- [ ] Every command above passes and no out-of-scope path is modified.

## STOP conditions

Stop on a red Plan 154 baseline, unavailable Plan 163 base, active exact-path
owner, unexpected caller, historical cross-plan rows that make safe migration
ambiguous, inability to distinguish guest/platform participants without a
public contract change, need to alter guest login or poll voting, unrelated
typegen drift, or any mandatory gate failing twice.

## Maintenance notes

Reviewers should inspect every delete predicate and the guest/poll join, not
only the action authorization. A later schema-hardening plan may add composite
co-plan constraints for every writer after historical data is audited; this
plan must not silently repair or delete pre-existing foreign rows.
