# Plan 286: Aggregate Contacts User Statistics Once

> **Executor instructions:** Authorize the Contacts users landing page once and
> load its six statistics through one bounded, service-role-only aggregate.
> Preserve every current predicate and destination link.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/contacts/src/app/[locale]/[wsId]/users/page.tsx' 'apps/contacts/src/app/[locale]/[wsId]/users/page.test.tsx' apps/contacts/src/components/statistics apps/contacts/src/lib/workspace.ts apps/contacts/src/lib/user-statistics.ts apps/contacts/src/lib/user-statistics.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — database migration/generated-type ownership
  must transfer after the green Plan 154 baseline
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / Contacts / authorization / tests
- **Depends on:** Plans 154 and 163; database/type transfer and adjacent Contacts
  review
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

One Contacts users-page render launches six exact-count queries and resolves the
satellite actor/permissions six times. Two cards query before checking
`manage_users`, so unauthorized renders still perform database work. The page
needs six scalars, not twelve independent auth/data round trips.

## Current state and exact contract

- `users/page.tsx:33-56` renders six async statistic components. Each component
  calls `getContactsWorkspacePermissions`; active/permanent/temporary users,
  groups, tags, and reports each issue a separate exact-count query.
- Resolve `getSatelliteAppSessionUser('contacts')` once, then call
  `getContactsWorkspacePermissions(wsId, actor)` once. Missing actor/workspace
  keeps the current `notFound()` behavior; an actor without `manage_users`
  renders no cards and performs **zero** statistic queries.
- Add private service-role-only RPC
  `private.get_contacts_user_statistics(p_ws_id uuid, p_now timestamptz default
  clock_timestamp())`, returning exactly one row:
  `active_users bigint, permanently_archived_users bigint,
  temporarily_archived_users bigint, user_groups bigint, user_group_tags
  bigint, user_reports bigint`.
- Preserve predicates exactly: active is `workspace_users.archived=false`;
  permanent is `archived=true AND archived_until IS NULL`; temporary is
  `archived=true AND archived_until > p_now`; groups/tags use `ws_id`; reports
  use `private.external_user_monthly_reports_workspace_view.user_ws_id`.
  `p_now` is captured once per page load and passed to the RPC for deterministic
  boundary behavior.
- Revoke the exact RPC from `PUBLIC, anon, authenticated`; grant only
  `service_role`. Define it `SECURITY DEFINER SET search_path = ''`, schema-
  qualify every relation, and validate the workspace exists. The app-owned
  helper must inspect RPC errors and fail the page explicitly rather than
  rendering false zero/null counts.
- Convert the six card modules to presentational components receiving a number,
  or replace them with one focused statistics-grid component. Keep titles,
  hrefs, layout, and translations unchanged.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Contacts | `bun --cwd apps/contacts vitest run src/lib/user-statistics.test.ts 'src/app/[locale]/[wsId]/users/page.test.tsx'` | one auth/permission/RPC call, zero unauthorized data calls, predicates/error/rendering pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/contacts-user-statistics.test.sql --typegen packages/types/src/supabase.ts` | six exact counts, time boundary, tenant isolation, ACL tests pass |
| Types | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot" && bun run --cwd apps/contacts type-check` | a second isolated typegen is byte-identical to the intentional generated diff; Contacts compiles |
| Contacts build | `bun run --cwd apps/contacts build` | production build exits 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** the users landing page; the six statistic cards/grid; one focused
Contacts loader and tests; additive private aggregate RPC, pgTAP, generated
types.

**Out of scope:** Contacts database tables/pages; report content; changing
archive semantics; adding public/Data API execution; generic permission N+1
cleanup elsewhere; dashboard redesign.

## Steps

1. Add red page/loader tests proving one actor resolution, one permission
   resolution, zero statistic queries for missing/unauthorized actors, one RPC
   for an authorized actor, exact card values/links, and visible failure on RPC
   error.
2. Add the exact aggregate RPC and signature-specific revoke/grant. Use one
   statement snapshot and explicit filters; add pgTAP for every bucket, exact
   `archived_until = p_now` boundary, cross-workspace rows, empty workspace, and
   authenticated execution denial.
3. Resolve auth once at the page boundary, call the focused service once, and
   render presentational cards from its result. Delete per-card database/auth
   access without changing their UX contract.
4. Run isolated DB/typegen, focused tests, Contacts typecheck/build, `bun check`,
   whitespace, and exact-scope review.

## Done criteria

- [ ] An authorized page load performs one actor lookup, one permission lookup,
      and one statistics RPC instead of six of each.
- [ ] Unauthorized/missing actors perform no statistics query.
- [ ] All six current predicates, links, titles, and archive-time boundaries
      remain exact; database failures never render false zeroes.
- [ ] RPC ACL, pgTAP, generated-type, Contacts test/type/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop if Plan 154 is not green; database/type ownership is not transferred; a
card predicate has changed on the execution base; reports cannot be counted in
the same private transaction snapshot; app-session auth would be replaced with
Supabase cookie auth; the RPC would become browser-callable; or a mandatory
gate fails twice.

## Maintenance notes

This is the concrete six-count Contacts landing-page aggregate. It does not
claim the broader deferred permission/education N+1 cleanup.
