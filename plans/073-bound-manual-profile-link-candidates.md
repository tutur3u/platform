# Plan 073: Bound Manual Profile-Link Candidate Search

> **Executor instructions:** Replace four workspace-wide reads plus in-memory
> filtering with one bounded database query, preserving the exact candidate
> contract and ranking. Do not execute while generated database types are owned
> by another lane.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/users-core/src/routes/users/links/manual/route.ts packages/users-core/src/routes/users/links/manual/route.test.ts apps/contacts/src/app/[locale]/[wsId]/users/groups/manager-link-dialog.tsx apps/contacts/src/app/[locale]/[wsId]/users/groups/manager-link-dialog.test.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Quote bracketed/parenthesized paths. Stop on candidate-contract, schema, or
> ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Performance
- **Depends on:** Plan 072; Mail, Inventory, and Zalo generated-type ownership release; Richfield dirty-path provenance clears
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every search currently loads every workspace membership, profile link, public
user, and private email, then returns at most 100 rows. Cost and memory grow
with the entire tenant and repeat while the operator types. The database should
filter, rank, project, and cap candidates before transfer.

## Current state

- `packages/users-core/src/routes/users/links/manual/route.ts:79-128` performs
  four unbounded reads and applies query filtering, email-match ordering, and
  `.slice(0, 100)` in application memory.
- The response fields are `id`, `displayName`, `avatarUrl`, `email`,
  `isEmailMatch`, and `linkedVirtualUserId`; preserve names/nullability/order.
- `manager-link-dialog.tsx:54-68` starts a query for every deferred search
  value while open. `useDeferredValue` prioritizes rendering; it is not a
  request debounce.
- Plan 072 supplies the behavioral route harness this query change must extend.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`.
Remain BLOCKED while Mail, Inventory revenue-bundles, Zalo, or another active
note owns generated database types. The Richfield note does not own
`packages/types/src/supabase.ts`, but records it as pre-existing dirty state, so
its provenance must also be resolved before editing. Create the additive migration with
`bun sb:new bound_manual_profile_link_candidates`; never hand-name it.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new bound_manual_profile_link_candidates` | one timestamped migration path |
| Apply locally | `bun sb:up` | migration applies cleanly |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | new pgTAP cases pass |
| Generate types | `bun sb:typegen` | generated RPC type present |
| Route tests | `bun run --cwd packages/users-core test -- src/routes/users/links/manual/route.test.ts` | all pass |
| UI tests | `bun run --cwd apps/contacts test -- 'src/app/[locale]/[wsId]/users/groups/manager-link-dialog.test.tsx'` | debounce/query cases pass |
| Types/build | `bun run --cwd packages/users-core type-check && bun run --cwd apps/contacts build` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- One migration created by `bun sb:new`
- `apps/database/supabase/tests/manual_profile_link_candidates.sql` (create)
- `packages/types/src/supabase.ts` (generated only)
- `packages/users-core/src/routes/users/links/manual/route.ts`
- `packages/users-core/src/routes/users/links/manual/route.test.ts`
- `apps/contacts/src/app/[locale]/[wsId]/users/groups/manager-link-dialog.tsx`
- `apps/contacts/src/app/[locale]/[wsId]/users/groups/manager-link-dialog.test.tsx` (create)
- `plans/README.md` only for status

Do not change POST behavior, permissions, response fields, or unrelated types.

## Git workflow

Use isolated branch `perf/bound-profile-link-candidates`, run `bun setup`, and
commit as `perf(users): bound profile link candidate search`. Do not push unless
instructed; claim the commit window before staging.

## Steps

### Step 1: Specify the SQL result and authorization boundary

Add one `public` RPC called only through the existing server admin client. It
accepts workspace UUID, virtual-user UUID, normalized query, and a limit whose
server value is fixed at 100. Join workspace membership to `users`,
`user_private_details`, and workspace-scoped links; verify the virtual user is
in the same workspace; search display name/email case-insensitively; rank exact
normalized target-email matches first, then the existing display/email/id key.
Revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant only
`service_role`. Add stable tie-breaking by platform user ID.

### Step 2: Prove bounded semantics in pgTAP

Use rollback-safe synthetic fixtures. Cover cross-workspace exclusion, private
email projection, linked metadata, email-match priority, case-insensitive
search, deterministic ordering, empty workspaces, and 101 candidates returning
exactly 100. Assert function privileges exclude anonymous/authenticated roles.

### Step 3: Replace the GET fan-out

Keep route authorization and target-workspace-user 404 behavior. Replace the
four corpus reads/maps/sort/slice with the typed RPC and map its snake-case
columns to the unchanged JSON contract. Extend Plan 072's route suite to assert
one bounded RPC and no corpus-table scans.

### Step 4: Debounce intentional searches

At the dialog boundary, use the repository's existing debounce hook/pattern to
wait 250 ms after typed non-empty queries; opening with an empty query still
loads the top 100 immediately. Query keys must use the debounced value. Test
rapid input with fake timers and prove only the settled value calls the facade.

## Test plan

Run every named pgTAP, route, and UI case. Use a large fixture to prove the
database result is capped; do not treat a mocked `.limit(100)` assertion alone
as performance proof.

## Done criteria

- [ ] One bounded database call replaces four workspace-wide reads.
- [ ] Results remain capped at 100 with identical fields/ranking semantics.
- [ ] RPC privileges and tenant containment are proven in pgTAP.
- [ ] Rapid typing produces one settled search request.
- [ ] Local apply, typegen, tests, build, `bun check`, and whitespace pass.

## STOP conditions

Stop if any generated-type ownership blocker remains, production needs more than the fixed
100-result contract, required joins cannot be expressed without exposing
private email data to client roles, the debounce hook does not exist and a new
shared primitive would expand scope, or any required gate fails twice.

## Maintenance notes

Keep authorization in the route and data reduction in SQL. Future pagination
must use a deterministic cursor; do not reintroduce offset or full-corpus reads.
