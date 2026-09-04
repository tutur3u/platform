# Plan 326: Page Mailbox Members and Batch Their Profiles

> **Executor instructions:** Replace the unbounded `1 + 2N` member listing with
> a stable cursor page and exactly three data queries after access resolution.
> Preserve profile fallback and mutation behavior; sequence after Plan 322.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- apps/mail/src/lib/mail/repository/members.ts apps/mail/src/lib/mail/repository/members.test.ts 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.ts' 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.test.ts' 'apps/mail/src/app/[locale]/(dashboard)/[wsId]/mail-settings-dialog.tsx' 'apps/mail/src/app/[locale]/(dashboard)/[wsId]/mail-settings-dialog.test.tsx' packages/internal-api/src/mail.ts packages/internal-api/src/mail.test.ts packages/internal-api/src/mail-types.ts tmp/agent-coordination`
> Stop on Plan 322, membership ordering, response, UI, or Mail/internal-api
> ownership drift.

## Status

- **Execution status:** BLOCKED — sequence after Plan 322 and obtain Mail/internal-api transfer
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW-MEDIUM
- **Category:** performance / correctness / tests
- **Depends on:** Plan 322 and exact Mail/internal-api ownership transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

Listing `N` mailbox members currently performs one unbounded membership query
and two concurrent profile queries per row. The settings request has no limit,
so database fan-out, concurrency, payload, and rendering all scale with the
entire shared-mailbox directory.

## Current state and exact contract

- `apps/mail/src/lib/mail/repository/members.ts:40-74` loads every membership
  ordered only by `created_at`, then `Promise.all`s one `users` and one
  `user_private_details` query per member. Lines 6-20 define that two-query
  resolver.
- The GET route at
  `apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.ts:11-24`
  returns `{ members }` with no page contract. `packages/internal-api/src/mail.ts:623-634`
  and `mail-settings-dialog.tsx:65-69,327-339` eagerly fetch/render the array.
- Freeze GET query parameters: `limit` defaults to 50 and is an integer 1-100;
  `cursor` is optional base64url JSON exactly
  `{ "createdAt": <ISO datetime>, "userId": <UUID> }`. Unknown/duplicate query
  keys are ignored as today; malformed cursor/limit returns sanitized 400 before
  data reads.
- Order membership by `created_at ASC, user_id ASC`; after a cursor select rows
  where `(created_at,user_id)` is lexicographically greater, fetch `limit + 1`,
  and return `{ members, nextCursor: string | null }`. No exact total is added.
- For visible IDs, issue one `.in` query to `users` and one to
  `user_private_details`; join through maps. Missing private details remain
  `{ email:null, fullName: users.display_name ?? null }`; a real query error
  fails the request. After `requireMailboxAccess`, query count is exactly three
  regardless of page size.
- Update `listMailMailboxMembers` to accept `{ cursor?, limit? }`, serialize
  query parameters, and return the new envelope. Convert the settings member
  query to `useInfiniteQuery`, flatten unique user IDs, and use the existing
  localized `mail.load_more` key. Do not add message keys or auto-prefetch all
  pages.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Repository/route | `bun --cwd apps/mail vitest run src/lib/mail/repository/members.test.ts 'src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.test.ts'` | cursor, ties, bounds, fallback, errors, and constant-query tests pass |
| Client | `bun --cwd packages/internal-api vitest run src/mail.test.ts && bun --cwd packages/internal-api type-check` | exact query/envelope types pass |
| UI | `bun --cwd apps/mail vitest run 'src/app/[locale]/(dashboard)/[wsId]/mail-settings-dialog.test.tsx'` | first page, load more, dedupe, error, and disabled-state cases pass |
| Mail | `bun type-check:mail && bun --cwd apps/mail run build` | typecheck and app build pass |
| N+1 absence | `rg -n 'getMailboxMemberProfile|\(rows \?\? \[\]\)\.map\(async' apps/mail/src/lib/mail/repository/members.ts` | old per-row resolver/fan-out are absent |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only in-scope paths and plan status changed |

## Scope

**In scope:** member-list repository and new test; GET route and new test;
internal-api Mail client/types/tests; settings-dialog infinite page rendering and
new focused test. Plan 322's mutation calls remain unchanged except conflict
resolution required by rebasing.

**Out of scope:** membership mutation policy/RPC, member search, exact totals,
new database migration/index, role changes, mailbox bootstrap unread counts,
other settings tabs, or new translations/dependencies.

## Git workflow

- Branch: `perf/page-mailbox-member-profiles` in an isolated worktree; run
  `bun setup` immediately and rebase after Plan 322.
- Commit: `perf(mail): page and batch mailbox member profiles`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

1. Add repository/route red tests for default/max/invalid limit, malformed
   cursor, empty page, more than one page, equal timestamps, missing private
   details, profile query errors, forbidden access, and exactly three post-auth
   queries for 1 and 50 members.
2. Implement strict cursor helpers and membership `limit + 1` query; bulk-load
   both profile tables, join in membership order, and produce an opaque next
   cursor only when another row exists.
3. Update internal-api input/response types and tests, preserving credentials,
   cache, base URL, and path behavior.
4. Convert only the members tab to an infinite query. Flatten pages with a
   user-ID dedupe guard, render the existing fields, and expose a bounded Load
   more button with loading/error behavior using existing translations.
5. Run focused suites, client/Mail types, Mail build, `bun check`, N+1 absence,
   scope, and whitespace gates.

## Done criteria

- [ ] One member page uses exactly one membership plus two bulk profile queries
  after access resolution, independent of page size.
- [ ] Stable cursor traversal returns every member once across equal timestamps;
  invalid/unbounded inputs fail with 400.
- [ ] Missing profile rows preserve current null/display-name fallback and real
  query failures are not rendered as missing data.
- [ ] The settings tab never eagerly drains later pages and can load them using
  existing localized UI.
- [ ] Focused tests, client/Mail typechecks, Mail build, `bun check`, scope, and
  whitespace gates pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if Plan 322 has not landed/rebased, another consumer requires the complete
array response, `created_at` is nullable or not stable for existing memberships,
the two profile tables cannot be bulk-read with current service-role access, or
the Mail/internal-api owner has not transferred exact paths.

## Maintenance notes

Future member search should be a separately reviewed set-based database query;
do not reintroduce all-page client filtering or per-row profile reads.
