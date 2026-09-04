# Plan 324: Bind Workspace Summary Actions to the Authenticated Actor

> **Executor instructions:** Remove caller-controlled identity from the public
> Server Action while preserving cookie, app-session, and Hive route behavior.
> Move the legacy Web route first-class and keep TanStack migration tracking
> accurate. Never weaken the verified route actors to preserve the old helper
> signature.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- packages/ui/src/lib/workspace-actions.ts packages/ui/src/lib/workspace-summaries.server.ts apps/web/src/__tests__/workspace-actions.test.ts apps/web/src/__tests__/workspace-route-app-session.test.ts apps/web/src/legacy-api-routes/v1/workspaces/route.ts apps/web/src/app/api/v1/workspaces/route.ts apps/hive/src/app/api/v1/hive/workspaces/route.ts apps/hive/src/app/api/v1/hive/workspaces/route.test.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`
> Stop on Server Action, route actor, response, or active G22 artifact drift.

## Status

- **Execution status:** BLOCKED — obtain G22 route-artifact transfer and coordinate Web/Hive consumers
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / migration / tests
- **Depends on:** G22 TanStack migration-artifact transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

`fetchWorkspaceSummaries` is exported from a `'use server'` module, yet accepts
a serialized `userId` that overrides session identity before service-role reads.
An unauthenticated action invocation can therefore enumerate another user's
member/guest workspace directory, tier, creator, and access metadata.

## Current state and exact contract

- `packages/ui/src/lib/workspace-actions.ts:1,202-224` exposes the action and
  computes `providedUserId ?? auth.getUser()`. Admin queries then use that ID at
  lines 233-238/353-357 and return cross-workspace metadata at 438-459.
- `apps/web/src/__tests__/workspace-actions.test.ts:315-335` explicitly freezes
  the unsafe bypass by expecting supplied `app-session-user` to skip auth.
- The Web route already verifies cookie/app-session actors through
  `withSessionAuth` and passes `user.id`; the Hive route verifies through
  `requireHiveAccess`. Those callers need an injectable non-action helper, not
  a privileged public action parameter.
- Create `workspace-summaries.server.ts` with `import 'server-only'` and export
  `fetchWorkspaceSummariesForActor({ supabase, userId, limit?, query? })`. It
  owns the current service-role aggregation and requires a nonblank verified
  actor ID. It must not contain `'use server'`.
- Keep `workspace-actions.ts` as the public action authority. Its exported
  `fetchWorkspaceSummaries({ limit?, query? } = {})` accepts no request,
  Supabase client, `userId`, or `requireAuth`; it derives the actor only from
  `createClient().auth.getUser()`, returns `[]` when absent (preserving the
  current action default), and delegates with that exact actor. `fetchWorkspaces`
  remains a no-argument wrapper.
- Move the changed live Web implementation with `git mv` to
  `apps/web/src/app/api/v1/workspaces/route.ts`; update the exact override ID's
  embedded source file and regenerate the manifest. The Web/Hive routes call
  only `fetchWorkspaceSummariesForActor` after their existing verified actors;
  preserve query bounds, status/cache envelopes, and all response fields.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| UI action | `bun --cwd packages/ui vitest run src/lib/workspace-actions.test.ts && bun --cwd packages/ui type-check` | forged identity is impossible; session action/helper tests pass |
| Web | `bun --cwd apps/web vitest run src/__tests__/workspace-route-app-session.test.ts 'src/app/api/v1/workspaces/route.test.ts' && bun run build:web` | cookie/app-session route parity and build pass |
| Hive | `bun --cwd apps/hive vitest run 'src/app/api/v1/hive/workspaces/route.test.ts' && bun --cwd apps/hive run build` | verified actor forwarding and build pass |
| Action surface | `rg -n 'userId|providedUserId|providedSupabase|request|requireAuth' packages/ui/src/lib/workspace-actions.ts` | no privileged injectable parameter remains in the action module |
| Migration | `bun migration:tanstack:manifest && bun web:api-routes:check` | first-class source and manifest are current; no legacy wrapper is generated |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope/size | `git status --short && wc -l packages/ui/src/lib/workspace-actions.ts packages/ui/src/lib/workspace-summaries.server.ts` | only in-scope files changed; both modules remain focused and below 700 lines |

## Scope

**In scope:** split the UI action/internal aggregation with focused package
tests; first-class Web route plus moved/updated tests; Hive route plus new test;
the exact TanStack override/manifest entries; current callers and response
types only as required by the signature split.

**Out of scope:** changing workspace summary fields/search/tier behavior; adding
pagination; changing app-session or Hive authorization; Rust implementation or
traffic cutover; other workspace APIs; new dependencies.

## Git workflow

- Branch: `fix/bind-workspace-summary-action-actor` in an isolated worktree;
  run `bun setup` immediately.
- Commit: `fix(workspaces): bind summary actions to session actors`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

1. Move existing aggregation tests to
   `packages/ui/src/lib/workspace-actions.test.ts` (create) and add red cases
   proving the action input type/runtime accepts only search fields, unauthenticated
   action calls return `[]`, and no supplied UUID can reach an admin query.
2. Extract the server-only actor helper without behavior drift. Keep pure search,
   tier, profile, and guest-share logic with it; leave the action file as a thin
   session-derived adapter. Add helper tests proving its actor is used exactly.
3. Move the Web route first-class, switch it to the internal helper after
   `withSessionAuth`, preserve cache/status/query behavior, move/update focused
   tests, and refresh the G22-owned override/manifest after transfer.
4. Switch Hive to the same helper only after `requireHiveAccess`; add tests that
   anonymous/denied calls never invoke it and the verified user ID is forwarded.
5. Run action, route, build, migration, repository, size, scope, and whitespace
   gates.

## Done criteria

- [ ] No exported Server Action accepts an actor ID, Supabase client, request,
  or auth-bypass flag.
- [ ] Only verified Web/Hive route actors can use the injectable internal helper.
- [ ] Forged/unauthenticated action tests reach no service-role membership/share
  query; legitimate cookie/app-session/Hive results remain compatible.
- [ ] The Web route is first-class and migration artifacts name its new source.
- [ ] Focused tests, three package/app checks/builds, route generator, manifest,
  `bun check`, scope, size, and whitespace gates pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if another supported app imports the injectable action signature, the
action's anonymous-empty behavior is contractually different, a Rust handler
already owns `/api/v1/workspaces`, the aggregation cannot be split without
client-bundling server code, or G22 has not transferred aggregate artifacts.

## Maintenance notes

Never add injectable identity or privileged clients back to a `'use server'`
export. Tests may inject them only through the `server-only` helper after a
separate verified actor boundary.
