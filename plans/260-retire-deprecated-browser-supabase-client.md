# Plan 260: Make Deprecated Browser Supabase Access Opt-In

> **Executor instructions:** Finish the broad browser-client split in measured
> domain batches. Move legitimate auth/realtime callers to the narrow modules,
> move product CRUD/storage behind typed APIs, correct public guidance, add a
> source guard, and only then default the compatibility client closed.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/supabase/src/next/client.ts packages/supabase/src/next/__tests__/client.test.ts packages/supabase/src/next/auth-browser.ts packages/supabase/src/next/realtime-browser.ts packages/supabase/src/next/realtime-log-provider.tsx packages/supabase/src/next/__tests__/realtime-log-provider.test.tsx packages/supabase/src/index.ts packages/supabase/README.md apps/docs/platform/architecture/authentication.mdx scripts/internal-api-migration.test.js apps/rewise/src apps/track/src 'apps/web/src/app/[locale]/(marketing)' 'apps/web/src/app/[locale]/auth-button.tsx' apps/web/src/components/chat-panel.tsx apps/web/src/hooks apps/web/src/__tests__/browser-supabase-migration.test.ts packages/tasks-ui/src packages/trigger/src packages/ui/src packages/utils/src/onboarding-helper.ts packages/utils/src/__tests__/onboarding-helper.test.ts packages/internal-api/src tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — first reconcile the retained Rewise work in
  Plan 026 and My Tasks work in Plans 079/259, then obtain exact-path transfer
  for every caller reported by the preflight inventory; the compatibility
  module/docs themselves have no active exact owner
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** migration / architecture / security / DX
- **Depends on:** Plans 026, 079, and 259 only where their retained or planned
  diffs overlap; exact caller ownership transfer is mandatory
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

`@tuturuuu/supabase/next/client` is documented as deprecated for browser CRUD
and storage, but it defaults to enabled, suppresses its warning in production,
and remains imported by dozens of runtime callers. The public package README
still teaches direct browser table queries and realtime through that broad
client. This leaves the internal-api migration boundary unenforced and keeps
product data, storage, auth, and realtime coupled to a single browser authority.

## Current state and target contract

- `packages/supabase/src/next/client.ts:35-50` resolves
  `NEXT_PUBLIC_SUPABASE_CLIENT_FORCE_BYPASS` or
  `SUPABASE_CLIENT_FORCE_BYPASS`, defaulting to `true`. Lines `53-69` suppress
  warnings in production; exported factories at `87-120` are deprecated.
- Narrow replacements already exist:
  `next/auth-browser.ts` exposes auth/session-only creation/switch helpers and
  `next/realtime-browser.ts` exposes realtime creation/types.
- A complete import inventory at the planned snapshot finds 36 broad-client
  use sites: 34 exact static package imports (31 runtime and three tests), one
  dynamic package import in a Tasks UI test, and one package-relative runtime
  import from `next/realtime-log-provider.tsx`. Confirmed product access
  includes Tasks raw fallback reads in
  `packages/tasks-ui/src/tu-do/boards/boardId/task-actions.tsx`, Calendar/task
  settings reads and writes in `packages/ui/src/hooks/use-calendar.tsx`, Rewise
  attachment storage in `apps/rewise/src/components/chat-panel.tsx`, Track
  request-image storage, and Trigger calendar-sync coordination table writes.
  Type-only `TypedSupabaseClient` imports are not runtime consumers and need not
  be churned merely to satisfy the guard.
- `packages/supabase/README.md:49-68,122-145,233-247` recommends the deprecated
  browser client for queries, realtime, typed clients, and best practices.
  `apps/docs/platform/architecture/authentication.mdx:865-874` correctly directs
  product data to internal-api and auth/realtime to narrow exceptions.
- The exact 31 runtime paths are: Rewise `chat-link.tsx` and `chat-panel.tsx`;
  Track `requests/hooks/use-request-images.ts`; Web account-delete, logout,
  onboarding-flow, auth-button, chat-panel, three Excalidraw/whiteboard hooks;
  Tasks UI scheduling-dialog, five realtime/presence/cursor hooks, task-actions,
  task-list-form, fade initializer, and three task-edit data/reset/save hooks;
  Trigger `calendar-sync-coordination.ts`; UI calendar-connections manager,
  legacy Google settings, task-item checkbox, calendar/workspace-presence/Yjs
  hooks; and Utils `onboarding-helper.ts`. Four test callers are the Tasks UI
  board-presence, board-realtime, cursor-tracking, and task-actions tests.
  `packages/supabase/src/next/realtime-log-provider.tsx` is the additional live
  internal caller; it uses only auth session/user methods and must switch to the
  narrow auth-browser client before strict mode. Step 1's scanner is
  authoritative if exact paths drift; a new path is a STOP, not permission to
  silently widen scope.
- Final invariant: outside `packages/supabase/src/next/client.ts` and its focused
  test, no static, dynamic, aliased, require, or package-relative value import
  of that broad client remains. Type-only imports remain temporarily allowed.
  Auth/session callers use
  `next/auth-browser`; channel-only callers use `next/realtime-browser`;
  product CRUD/storage callers use typed `packages/internal-api` functions or
  an existing server route. Do not replace direct browser access with raw
  `fetch` in client code.
- After the value-import count is zero, missing compatibility flags mean strict
  mode: `shouldForceBypass()` defaults false and the deprecated factories throw.
  A deliberate temporary escape requires exactly
  `SUPABASE_CLIENT_FORCE_BYPASS=true` or its existing public counterpart. Keep
  the flags for emergency rollback; do not add another flag.
- Rewrite README examples to the narrow auth/realtime imports and typed
  internal-api data access. Extend the already canonical
  `scripts/internal-api-migration.test.js` with a fixture-tested import scanner that
  fails on any new value import and asserts the documentation boundary.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, `$vercel-react-best-practices`, and
`$tuturuuu-commit`. Read root AGENTS and the CI-tooling reference. Run the import
inventory before editing and save its exact path-to-category classification in
the coordination note. If a product-data caller has no existing safe server/API
boundary, STOP and split a domain-specific first-class route plan with the
required Rust/override/manifest artifacts; this plan may add typed facades only
over existing safe routes. Do not enable strict mode while any value caller
remains.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Static preflight baseline | `rg --sort path -l "^import \\{ (createClient|createDynamicClient) \\} from '@tuturuuu/supabase/next/client';$" apps packages --glob '*.ts' --glob '*.tsx'` | before edits, exactly 34 planned-snapshot static paths (31 runtime, three tests) are printed and classified; the source-contract test below owns the final zero-match assertion |
| Dynamic/internal preflight | `rg -n "import\\('@tuturuuu/supabase/next/client'\\)" packages/tasks-ui/src --glob '*.ts' --glob '*.tsx' && rg -n "from './client'" packages/supabase/src/next/realtime-log-provider.tsx` | before edits, exactly the task-actions dynamic test and realtime-log-provider relative runtime import are printed; the source-contract test below owns the final zero-match assertion |
| Focused client | `bun --cwd packages/supabase vitest run src/next/__tests__/client.test.ts src/next/__tests__/realtime-log-provider.test.tsx` | default closed, both explicit bypass flags, strict override, warn-once, provider narrow-auth behavior, and cleanup pass |
| Source contract | `node --test scripts/internal-api-migration.test.js` | zero external value imports; type-only imports classified; docs contain no deprecated examples |
| Web/Utils callers | `bun --cwd apps/web vitest run src/__tests__/browser-supabase-migration.test.ts src/__tests__/logout-functionality.test.tsx 'src/app/[locale]/public-shell-compile-graph.test.ts' && bun --cwd packages/utils vitest run src/__tests__/onboarding-helper.test.ts` | Web auth/realtime/whiteboard migration and Utils onboarding behavior pass through narrow or typed boundaries |
| Domain tests | `bun --cwd packages/tasks-ui vitest run && bun --cwd packages/ui vitest run && bun --cwd packages/trigger vitest run && bun --cwd apps/rewise vitest run && bun --cwd apps/track vitest run` | all migrated browser behaviors pass without raw product access |
| Types | `bun run --cwd packages/supabase type-check && bun run --cwd packages/internal-api type-check && bun run --cwd packages/tasks-ui type-check && bun run --cwd packages/ui type-check && bun run --cwd packages/trigger type-check && bun run --cwd packages/utils type-check && bun run --cwd apps/rewise type-check && bun run --cwd apps/track type-check && bun run --cwd apps/web type-check` | affected packages/apps compile |
| Builds | `bun run --cwd apps/tasks build && bun run --cwd apps/rewise build && bun run --cwd apps/track build && bun run --cwd apps/web build` | representative live hosts build serially |
| Repository | `bun test:scripts && bun check && git diff --check` | script fleet, canonical gate, and whitespace pass |

## Scope

**In scope:** the deprecated client and focused test; the realtime-log provider
and its new focused test; existing narrow browser modules only when an exact
missing auth/realtime capability is proved; package root docs/exports;
authentication architecture docs; the existing canonical
`scripts/internal-api-migration.test.js`; every value-import caller found by
the baseline inventory; typed
internal-api/server route/test files required to replace those exact CRUD or
storage calls through routes that already exist; focused tests for each migrated
behavior, including the new Web migration test named in the command table.

**Out of scope:** type-only import cleanup; server-side Supabase clients;
database schema/RLS/typegen; auth/realtime semantic redesign; Web-to-Rust route
cutover; adding or substantially changing a Web API route; TanStack override or
migration-manifest edits; replacing calls with client raw fetch; new product behavior; removing
the rollback flags; unrelated internal-api decomposition; dependency/lockfile
changes unless a separately reviewed need is proved.

## Steps

1. Extend `scripts/internal-api-migration.test.js` in red mode. Its scanner
   must distinguish type-only from value imports, print every violating path,
   detect multiline named imports, package-relative imports of the deprecated
   module, plus dynamic `import()`/`require()`, and
   assert the exact public README markers are gone. Implement this with
   dependency-free Node source scanning and fixture cases; do not add a parser
   dependency. This file is already in
   root `test:scripts`; do not edit the root manifest or runner. Record every
   baseline value caller and classify it as auth, realtime, product CRUD,
   storage, or test/config.
2. Migrate auth/session and realtime-only callers first to the existing narrow
   modules. Move `realtime-log-provider.tsx` to the auth-browser client and add
   a focused mount/user/auth-change/unsubscribe test. Preserve channel cleanup,
   session switching, singleton behavior, and test mocks. Do not grant
   table/storage methods through the narrow exports.
3. Migrate each product CRUD/storage domain in small green batches. Reuse or
   add typed internal-api facades over existing authorized routes; preserve query
   keys, optimistic updates, uploads, realtime invalidation, and error behavior.
   If an adequate route does not already exist, STOP and create the separately
   reviewed route-parity follow-up. Complete Rewise/Tasks overlapping plans or
   rebase their exact paths first.
4. Rewrite the package README and root export guidance so every example follows
   internal-api or the narrow auth/realtime exception. Align, but do not weaken,
   the canonical authentication architecture page.
5. When and only when the source test reports zero external value imports, change
   the compatibility default to false. Test missing flags, each explicit true/
   false spelling, strict mode precedence, production behavior, and warn-once.
6. Run every focused/domain/typecheck/build/script/repository gate serially.
   Review the exact diff to ensure no temporary bypass was added to app config.

## Test plan

- Source-scanner fixtures distinguish value, mixed named, type-only, multiline, alias,
  dynamic require/import, and package-self imports.
- Deprecated client tests cover no flags, public/server bypass, explicit false,
  strict true, production, and warning reset without exposing environment data.
- Auth/realtime tests prove the narrow modules cannot perform product CRUD or
  storage through an accidentally exported broad type/factory.
- Every migrated CRUD/storage path retains success, authorization, error,
  retry/cache, and cleanup behavior through its focused existing/new test.
- Public documentation/source guard prevents reintroducing the old examples.

## Done criteria

- [ ] No app/package outside the deprecated module/test has a static, dynamic,
      require, or package-relative value import of the broad client; the source
      guard enforces this in `bun check`.
- [ ] Legitimate browser auth/realtime uses only narrow modules, while every
      product CRUD/storage operation uses a typed server boundary.
- [ ] Compatibility is disabled by default and can be enabled only by the two
      existing explicit temporary flags.
- [ ] Public package and architecture docs agree on the enforced boundary.
- [ ] All focused/domain/type/build/script/repository gates pass with no
      dependency, lockfile, schema, or unrelated route-artifact drift.

## STOP conditions

Stop if any exact caller owner has not transferred its path, the inventory
cannot distinguish type-only/value imports, a caller needs direct product data
without a safe authorization boundary, a narrow module would expose CRUD or
storage, a Web API route would need to be added or substantially changed, a
retained Plan 026/079/259 diff overlaps, strict-default activation
would still break a runtime caller, or any mandatory gate fails twice.

## Maintenance notes

The compatibility flag is an emergency rollback valve, not an architecture.
Future browser data work belongs behind typed internal APIs; auth and realtime
exceptions must stay capability-narrow and mechanically visible.
