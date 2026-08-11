# Plan 206: Retire the Orphaned TanStack Contacts Component Fork

> **Executor instructions:** Execute from reviewed Plan 197, prove the redirected
> TanStack users routes have no component dependency, delete the unreachable CRM
> component closure, and remove only package dependencies proven unused after
> deletion.
>
> **Drift check (run first):**
> `git diff --stat 9747845aae..HEAD -- apps/tanstack-web/src/components/users 'apps/tanstack-web/src/routes/$locale/$wsId/users' apps/tanstack-web/src/lib/platform/redirects.ts apps/tanstack-web/src/routeTree.gen.ts apps/tanstack-web/package.json bun.lock apps/contacts/src tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** architecture / satellite cutover / dead code
- **Depends on:** Plan 197 DONE at reviewed commit `9747845aae`; TanStack and
  Mail-owned lockfile transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from `9747845aae`

## Why this matters

Plan 197 made Contacts the sole reachable workspace-user CRM owner and replaced
all 18 TanStack users pages with root/splat redirects, deliberately leaving the
component tree untouched. That tree is now 129 files/22,494 lines with no
external importer, including 38 byte-identical Contacts copies. Keeping it
invites fixes and tests against an unreachable second authority.

## Exact contract

- Preserve the two Plan 197 redirect routes, query forwarding, Contacts origin
  helper, generated route tree, and every Contacts source file byte-for-byte.
- Delete the complete closed graph under
  `apps/tanstack-web/src/components/users/**`, including orphaned tests and
  local barrels. Do not move behavior back into TanStack.
- Re-prove aliases, relative imports, dynamic imports, test mocks, story/config
  references, string-based loaders, and package exports before deletion.
- Inventory `apps/tanstack-web/package.json` dependencies before and after the
  deletion. Remove only dependencies with zero remaining source/config/script
  consumer, using `bun remove` from the owning workspace; inspect and retain
  only expected manifest/lockfile churn. Do not make generic dependency-cleanup
  changes.
- The current reviewed planning ledger has refreshed Plans 168 and 172 to target
  Contacts plus shared internal API only. Treat that reconciled contract as
  authoritative even though the source worktree starts from the earlier Plan
  197 commit; do not copy the old plan files into the worktree and do not
  recreate this fork.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-development-tooling` if a source-boundary check changes, and
`$tuturuuu-commit`. Read TanStack/Contacts instructions. Obtain TanStack and
`bun.lock` ownership transfer. Create an isolated worktree at `9747845aae` and
run `bun setup` immediately; do not cherry-pick shared dirty plan files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Reachability | `rg -n '@/components/users|components/users' apps/tanstack-web/src --glob '!apps/tanstack-web/src/components/users/**'` | no matches before deletion; any runtime match is a STOP |
| Absence | `test ! -e apps/tanstack-web/src/components/users` | exit 0 after deletion |
| Redirect tests | `bun --cwd apps/tanstack-web vitest run src/lib/platform/redirects.test.ts src/routes/workspace-users-contacts-redirect.test.ts` | Plan 197 redirect/query/source contracts pass |
| Route tree | `git diff --exit-code 9747845aae -- apps/tanstack-web/src/routeTree.gen.ts` | no output after build; deletion does not change Plan 197's root/splat route ownership |
| Dependency proof | `rg -n '"[^"]+"' apps/tanstack-web/package.json` plus one scoped `rg` per removal candidate | each removed package has zero remaining consumer |
| Typecheck | `bun run --cwd apps/tanstack-web type-check` | exit 0 |
| Build | `bun run --cwd apps/tanstack-web build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** delete `apps/tanstack-web/src/components/users/**`; retain/update
only Plan 197's redirect helper/tests/source-contract test if an assertion must
move out of the deleted tree; regenerate `routeTree.gen.ts`; remove only newly
proven-unused TanStack dependencies via Bun; expected `bun.lock` churn.

**Read-only evidence:** Contacts components/routes, Plan 197 commit/tree, Plans
168/172. **Out of scope:** Contacts behavior, users-core/users-ui/internal-api,
API routes, reversing ownership, new UI, translations, database, or broad
dependency upgrades.

## Steps

1. Verify the exact Plan 197 commit/base and rerun a full reachability inventory.
   Record file/line/byte totals and remaining duplicate hashes. Any importer
   outside the deletion closure is a STOP until explicitly classified.
2. Confirm `src/routes/workspace-users-contacts-redirect.test.ts` remains outside
   the deletion tree, then delete all 129 component files. Run the Vite build to
   regenerate/validate the route tree and prove only root/splat user redirects
   remain.
3. Compare TanStack dependency usage before/after. For each dependency made
   unused solely by deletion, run `bun remove <package>` from
   `apps/tanstack-web`; do not manually edit the manifest. Review exact lockfile
   changes and leave ambiguous/shared packages intact.
4. Run redirect tests, route generation, typecheck, production build,
   repository, whitespace, and final reachability/absence checks.

## Done criteria

- [ ] The 129-file/22,494-line unreachable TanStack users component fork is absent.
- [ ] Contacts remains the only reachable workspace-user CRM implementation.
- [ ] Plan 197 root/splat redirects and query forwarding remain green.
- [ ] Only dependencies proven unused by this deletion are removed through Bun.
- [ ] Route generation, tests, typecheck, build, repository, and whitespace pass.

## STOP conditions

Stop if Plan 197 is not the source base, the current shared planning ledger has
regressed Plans 168/172 back to TanStack CRM components, an external/dynamic
importer exists, Contacts would need edits, lockfile ownership is unavailable,
dependency usage is ambiguous, or a mandatory gate fails twice.
