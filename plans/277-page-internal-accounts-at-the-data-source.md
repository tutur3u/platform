# Plan 277: Page Internal Accounts at the Data Source

> **Executor instructions:** Replace full Supabase Auth directory scans and
> per-account storage RPC fan-out with service-role-only private database RPCs.
> Preserve the existing Infrastructure list/reset HTTP and internal-api
> contracts while applying exact filtering, sorting, counting, limit, and
> offset in PostgreSQL and enriching storage only for returned page rows.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/internal-accounts apps/infrastructure/src/app/api/v1/infrastructure/internal-accounts packages/internal-api/src/infrastructure/internal-accounts.ts packages/internal-api/src/infrastructure/internal-accounts.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 154 must become green and the exact
  migration/generated-type paths must be transferred before execution
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / Infrastructure / database / test coverage
- **Depends on:** Plan 154 and the completed Plan 163 isolated-typegen base;
  exact database migration/test and generated-type ownership transfer even
  though the runtime paths are currently unowned
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Every internal-account list, search, sort, or cursor request currently walks up
to 10,000 Auth users in sequential 1,000-row Admin API pages, enriches every
matching internal profile, then applies the requested limit. A 48-row response
can subsequently issue 96 storage RPC requests concurrently. The list returns
500 once the total Auth directory exceeds 10,000 users even when very few users
have an exact `@tuturuuu.com` address. Password reset by email repeats the same
bounded full-directory scan.

## Current state and exact contract

- `listInternalAccountUsers` calls `auth.admin.listUsers` until exhaustion or
  ten pages, filters the exact internal domain in application memory, loads all
  matching `public.users` profiles, applies flags/search/sort/count, and only
  then slices the numeric offset cursor. Keep the route defaults: active and
  verified only, limit 24, maximum limit 48, offset zero, display-name ascending.
- Preserve the exact internal-address predicate: normalize with trim/lowercase
  and accept only addresses whose normalized value ends in
  `@tuturuuu.com` with one or more local-part characters that are neither
  whitespace nor `@`, matching `/^[^\s@]+@tuturuuu\.com$/i`. Do not accept
  subdomains or suffixes such as `@sub.tuturuuu.com` or
  `@tuturuuu.com.example`.
- Add `private.list_internal_accounts(
  p_active_only boolean default true,
  p_verified_only boolean default true,
  p_query text default null,
  p_sort_by text default 'displayName',
  p_sort_direction text default 'asc',
  p_offset integer default 0,
  p_limit integer default 24
  )`. Reject unsupported sort keys/directions and values outside offset `>= 0`
  and limit `1..48` with stable named `P0001` errors; normalize a blank query to
  null and otherwise compare its trimmed lowercase value.
- The list RPC `RETURNS TABLE(accounts jsonb, total_count bigint)` and always
  returns exactly one envelope row, including when the page is empty or its
  offset is past the end. `accounts` is an ordered JSON array whose objects have
  exactly `user_id uuid`, `email text`, `created_at timestamptz`,
  `display_name text`, `username text`, `email_confirmed_at timestamptz`,
  `last_sign_in_at timestamptz`, `banned_until timestamptz`,
  `is_disabled boolean`, `personal_workspace_id uuid`,
  `storage_used_bytes bigint`, and `storage_limit_bytes bigint`; use `[]`, not
  null, for no page rows. `total_count` is the exact filtered count independent
  of offset and limit.
- Build the candidate relation from `auth.users` with a left join to
  `public.users`. Normalize email once. Resolve display name as the first
  non-blank value of `public.users.display_name`, then
  `auth.users.raw_user_meta_data ->> 'display_name'`, `->> 'full_name'`, and
  `->> 'name'`; resolve username from trimmed `public.users.handle`. Preserve
  `is_disabled` as a non-null `banned_until` strictly later than the database
  statement timestamp.
- Apply `activeOnly` and `verifiedOnly` before count. Search preserves the
  current JavaScript `.includes()` semantics: it is a literal case-insensitive
  substring over normalized email, resolved display name, and username. Use
  `strpos(lower(coalesce(value, '')), normalized_query) > 0` or equivalently
  escape SQL pattern metacharacters; `%`, `_`, and backslash are ordinary
  search characters, never wildcards. Preserve the four public sort selectors
  (`displayName`, `createdAt`, `email`, `lastSignInAt`) and requested direction,
  but deliberately replace environment-dependent Node `localeCompare` ordering
  with this reviewed PostgreSQL contract: text primary keys order first by
  `lower(value) COLLATE "C" <direction> NULLS LAST` and then by
  `value COLLATE "C" <direction> NULLS LAST`; timestamp primary keys order
  directly in the requested direction with `NULLS LAST`. Reserve `coalesce`
  for search expressions so a null sort value never becomes an empty string.
  All selectors then use
  `normalized_email COLLATE "C" ASC` and `user_id ASC` as deterministic final
  tie-breakers. This is an intentional ordering clarification, not a claim that
  PostgreSQL reproduces host-locale `localeCompare`. Freeze case, accent,
  Unicode, null, and equal-key page boundaries in SQL and route tests.
- Compute the exact count from the fully filtered candidate relation and apply
  SQL `LIMIT p_limit OFFSET p_offset` in a separate page CTE over the same
  materialized candidates. Only after that page CTE may the function resolve
  each account's earliest-created personal workspace and its storage values.
  Aggregate `storage.objects` for only those page workspace IDs, resolve each
  page workspace's current storage limit inside this single database call, and
  JSON-aggregate in the already-frozen page order. Preserve drive-size
  semantics: bucket `workspaces`, first path segment equal to the workspace ID,
  non-null owner, and the sum of numeric `metadata.size` with zero fallback.
  Never call
  `get_workspace_drive_size` or `get_workspace_storage_limit` across the
  network per account.
- Add `private.find_account_by_email(p_email text)` returning exactly
  `user_id uuid` and normalized `email text`, with zero or one row. Password
  reset currently supports any valid account email, including external
  domains, so this lookup is deliberately domain-neutral: trim/lowercase and
  compare by exact equality, return zero rows for blank or absent input, and
  perform no profile or storage work. `resetAccountPasswordByEmail` uses this
  RPC to obtain the Auth user ID, retains the current external-account,
  not-found, and self-reset behavior, and continues to call
  `auth.admin.updateUserById`; no reset response or password policy changes are
  in scope. The exact `@tuturuuu.com` rule applies only to the list RPC.
- Both functions are `SECURITY DEFINER` with an empty fixed `search_path` and
  fully qualified objects. Revoke all privileges and EXECUTE from PUBLIC,
  `anon`, and `authenticated`; grant EXECUTE only to `service_role`. The
  Infrastructure authorization helper remains the HTTP actor boundary and the
  service invokes both functions only through its admin client with
  `.schema('private').rpc(...)`.
- Keep `GET /api/v1/infrastructure/internal-accounts` request validation and
  `ListInternalAccountsParams`, `InternalAccount`, and
  `ListInternalAccountsResponse` wire shapes unchanged. Map RPC snake_case rows
  to the existing camelCase model, derive `isSelf` from the authorized actor,
  preserve numeric `nextCursor = offset + returnedRows` only when it is below
  exact `count`, and preserve sanitized 500 handling. Internal-api consumers
  must require no changes.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS plus the database skill references, Plans
154 and 163, both
internal-account routes, service/tests, internal-api client/tests, current
storage functions, and active ownership notes. Obtain explicit database/test/
generated-type transfer before editing; the Infrastructure runtime paths have
no current exact-path owner. Use an isolated worktree and run `bun setup`
immediately. Do not apply a production migration or use live credentials/data.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Infrastructure service | `bun --cwd apps/infrastructure vitest run src/lib/internal-accounts/service.test.ts` | list/reset RPC mapping, empty/page/count/cursor/error, and zero Auth-directory/storage fan-out cases pass |
| Infrastructure route | `bun --cwd apps/infrastructure vitest run 'src/app/api/v1/infrastructure/internal-accounts/route.test.ts'` | unchanged GET/POST validation, response, and sanitized-error contracts pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/infrastructure/internal-accounts.test.ts` | existing query parameters and response wire contract remain unchanged |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/internal-account-directory.sql` | exact domain, flags, literal search, four C-collated sorts, null/tie order, offset/count, storage bound, lookup, and ACL assertions pass |
| Full/typegen database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes and both private RPC types update atomically |
| Infrastructure types/build | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both exit 0 with the generated private RPC types |
| Internal API types | `bun run --cwd packages/internal-api type-check` | exit 0 without public API shape drift |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** one additive migration defining the two exact private RPCs and
ACLs; one focused pgTAP file; generated Supabase types; Infrastructure list and
password-reset service paths plus focused tests; list route tests only where
needed to freeze compatibility; internal-api tests/type annotations only if
needed to prove unchanged wire behavior.

**Out of scope:** changing Infrastructure authorization or permissions;
changing list request/response fields, cursor encoding, UI, mutations by user
ID, password policy, reset provider, or error disclosure; general Auth Admin
directory APIs; changing the existing public storage RPC contracts; production
migration application; creating a public/authenticated directory surface.

## Steps

1. Extend service and route tests first. Prove no `auth.admin.listUsers` call is
   made for either list or email reset, no page-level call reaches either
   public storage RPC, snake/camel mapping is exact, empty results preserve
   `count: 0`, and database failures remain sanitized.
2. Add the two private functions with exact signatures, validation, fixed
   search paths, service-role-only ACLs, and fully qualified catalog access.
   Construct the list as filtered candidates, exact count/window, bounded page,
   then page-only workspace/storage enrichment in one RPC invocation.
3. Add pgTAP fixtures with more than 10,000 non-internal Auth users and a small
   internal population. Cover subdomain/suffix rejection, active/verified flag
   combinations, blank and mixed-case search, literal `%`, `_`, and backslash
   searches, all four ascending/descending sorts, case/accent/Unicode C-collation
   fixtures, null-last behavior, equal-value email/user-ID ties, empty and past-end
   offsets, limit 1 and 48, exact count, and stable next-page membership. Cover
   domain-neutral exact email lookup for internal and external accounts plus
   blank/absent input separately from the list-domain assertions.
4. Add page-storage fixtures with accounts with no personal workspace, multiple
   personal workspaces, storage objects, explicit limits, and subscription
   defaults. Prove only the earliest personal workspace is chosen, byte totals
   and nulls match current behavior, and query/RPC work is bounded to the page.
   Test invalid arguments plus EXECUTE denial for PUBLIC/anon/authenticated and
   success for service_role for both functions.
5. Replace the list scan/profile batches/storage `Promise.all` with one typed
   private RPC wrapper. Replace password-reset email scanning with the exact
   lookup RPC while preserving self-reset, not-found, update provider, and
   response semantics. Remove now-dead scan constants/helpers only after tests
   prove neither path imports or invokes them.
6. Run focused/full isolated pgTAP and atomic typegen, focused app/internal-api
   tests, Infrastructure and internal-api typechecks, the real Infrastructure
   build, `bun check`, whitespace, and exact-scope review.

## Done criteria

- [ ] List work is independent of total Auth-directory size and SQL applies
      filter/count/sort/limit/offset before page-only storage enrichment.
- [ ] A 48-account page uses one private database RPC and no per-account
      network RPCs; results retain profile, storage, count, and numeric-cursor
      behavior while using the explicitly reviewed C-collated sort order.
- [ ] Direct password reset by internal or external email performs one exact
      private lookup and no Auth-directory scan while retaining its HTTP and
      provider contract.
- [ ] Both RPCs are callable only by service_role, and exact-domain/noninternal/
      literal-search/sort/null/tie/>10k/storage/ACL coverage passes in isolated
      pgTAP.
- [ ] Generated types, focused tests, app/package typechecks, Infrastructure
      build, `bun check`, whitespace, and scope gates all pass.

## STOP conditions

Stop on missing Plans 154/163 or exact-path transfer, inability to expose
`auth.users` safely through a fixed-search-path service-role-only function,
inability to apply the exact explicit C-collated sort contract, a request to
make either RPC authenticated/public, storage semantics requiring an unbounded
pre-page scan, unexpected generated-type drift beyond the two RPCs, production
credentials/data, need to change the public HTTP/internal-api contract, or any
mandatory gate failing twice.

## Maintenance notes

Pagination must bound the authoritative read, not merely slice an already
materialized directory. Administrative database helpers that read `auth.users`
must remain private, service-role-only, fixed-search-path functions, and page
enrichment should stay inside one bounded database round trip.
