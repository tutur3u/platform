# Plan 197: Keep Workspace-User CRM Pages in Contacts

> **Executor instructions:** Replace TanStack's reachable workspace-user CRM
> page implementations with an origin-aware Contacts redirect boundary. Keep
> Contacts canonical and do not migrate or redesign CRM UI in this plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/tanstack-web/src/routes/$locale/$wsId/users' apps/tanstack-web/src/components/users apps/tanstack-web/src/lib/platform/redirects.ts apps/tanstack-web/src/lib/platform/redirects.test.ts apps/tanstack-web/src/routeTree.gen.ts apps/contacts/src/proxy.ts apps/docs/platform/architecture/satellite-apps.mdx scripts`
> Stop if Contacts ownership or TanStack file-route conventions changed.
> The Contacts proxy/docs and TanStack component directory are read-only drift
> evidence; they are not edit scope.

## Status

- **Execution status:** DONE — reviewed commit `9747845aae` on
  `refactor/tanstack-contacts-user-redirects`
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** architecture / migration / tests
- **Depends on:** none; exact paths are currently unclaimed
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Contacts is the documented hard owner of the complete workspace-user CRM, but
TanStack currently registers 18 independently implemented `/users/**` pages.
Those pages can silently reclaim Contacts URLs at a future cutover, and the
Web-derived migration manifest cannot report the conflict because Web correctly
has no users page tree. One redirect boundary makes the ownership decision
executable and prevents further UI/permission drift.

## Current state

- `apps/docs/platform/architecture/satellite-apps.mdx:8-22` says Contacts owns
  the entire `workspace_users` CRM and Web has no users section.
- `apps/contacts/src/proxy.ts:116-141` enumerates Contacts-owned users roots,
  including approvals, feedbacks, groups, reports, structure,
  topic-announcements, and tutoring.
- There are 18 route files under
  `apps/tanstack-web/src/routes/$locale/$wsId/users/**`; generated
  `apps/tanstack-web/src/routeTree.gen.ts:138-174` registers them.
  `users/approvals.tsx:18-75`, for example, runs its own auth/workspace/
  permission loader rather than redirecting.
- `apps/tanstack-web/src/lib/platform/redirects.ts:212-223` already resolves the
  Contacts origin. Existing `workforce.tsx` and `posts.tsx` demonstrate 307
  satellite redirects, while the users routes do not use that origin helper.
- `apps/tanstack-web/src/components/users` contains 129 files. Their cleanup is
  separate: this plan may delete only files proven unreachable after the route
  switch and must keep shared/non-users consumers intact.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, and
`vercel-react-best-practices`. Read root and TanStack instructions. Confirm no
active owner, use an isolated worktree at the planned SHA, and run `bun setup`
immediately. Inventory all route/component imports before deletion.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route inventory | `find 'apps/tanstack-web/src/routes/$locale/$wsId/users' -type f | sort` | exactly the 18 current implementation files before edits |
| Focused tests | `bun --cwd apps/tanstack-web vitest run src/lib/platform/redirects.test.ts src/routes/workspace-users-contacts-redirect.test.ts` | root/nested/query redirects and guard assertions pass |
| Route generation | `bun run --cwd apps/tanstack-web build` | Vite regenerates/validates the route tree and production build passes |
| Typecheck | `bun run --cwd apps/tanstack-web type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** delete the 18 current implementation files; create
`apps/tanstack-web/src/routes/$locale/$wsId/users/index.tsx` for `/users` and
`apps/tanstack-web/src/routes/$locale/$wsId/users/$.tsx` for every descendant;
extend `src/lib/platform/redirects.ts` and its test; regenerate
`routeTree.gen.ts`; create
`apps/tanstack-web/src/routes/workspace-users-contacts-redirect.test.ts`.

**Out of scope:** Contacts code or UX changes; API route ownership; users-core/
users-ui behavior; reversing the Contacts cutover; deleting components with any
remaining importer; deleting any of the 129 TanStack user components in this
plan; migration-manifest API entries.

## Git workflow

Use `refactor/tanstack-contacts-user-redirects` and commit
`refactor(tanstack): preserve Contacts user ownership`. Claim/release the commit
window; do not push or open a PR.

## Steps

1. Characterize a helper that produces a Contacts URL for the exact workspace
   users suffix and preserves query parameters without accepting an arbitrary
   origin. Add tests for `/users`, deeply nested routes, encoded path segments,
   query strings, and local/production origin selection. **Verify:** focused
   helper tests pass.
2. Delete the 18 concrete implementations. Create `users/index.tsx` with route
   id `/$locale/$wsId/users/` and `users/$.tsx` with route id
   `/$locale/$wsId/users/$`, following the existing Mail index and Calendar
   splat redirect exemplars. Both loaders throw a 307 redirect; the splat passes
   `params._splat`, and both pass `location.search` into the bounded helper. The
   redirect must preserve `wsId`, the path suffix, and query string and must not
   perform a second auth or permission decision. Regenerate the route tree.
   **Verify:** focused route tests prove representative exact and catch-all
   routes redirect and no former route implementation is registered.
3. Add a source contract assertion that rejects future non-redirect page
   definitions below the Contacts-owned TanStack prefix. Inventory imports only
   to record the now-unreachable component cleanup as a separate follow-up; do
   not delete components here. **Verify:** the focused test reports no forbidden
   route implementation and `git status --short` contains no component edit.
4. Run the TanStack production build/typecheck, `bun check`, whitespace, and a
   final scoped status audit.

## Done criteria

- [ ] `/users` and every `/users/**` path redirect with HTTP 307 to Contacts,
      preserving workspace, suffix, and query parameters.
- [ ] TanStack performs no duplicate CRM auth, permission, loader, or rendering
      work on those paths.
- [ ] The generated route tree contains only the redirect boundary for the
      Contacts-owned prefix.
- [ ] A focused contract test prevents a second TanStack CRM page authority.
- [ ] No TanStack user component is edited or deleted in this ownership fix.
- [ ] Focused tests, build/typecheck, repository, and whitespace gates pass.

## Execution result

Completed in clean isolated worktree
`.worktrees/refactor-tanstack-contacts-user-redirects`. Commit
`9747845aae8a5276bc2de741dcf13d250b564339` replaces the eighteen independent
CRM implementations with the root/splat Contacts redirects, adds the bounded
URL helper and contract tests, and regenerates the route tree without touching
TanStack user components. Focused Vitest passed 26 tests, TanStack typecheck and
production build passed (85 prerendered pages), `bun check` passed, and
diff/scope gates passed. The route generator emits a known non-failing warning
that the plan-mandated source-contract test under `src/routes` has no `Route`
export and excludes it correctly. No push or PR was created.

## STOP conditions

Stop on active ownership, evidence that Contacts no longer owns a listed route,
TanStack routing that cannot express root plus descendant redirects without
changing another product route, an unexpected migration-manifest requirement,
or a mandatory gate failing twice.
