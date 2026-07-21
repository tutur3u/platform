# Platform Patterns

These patterns were moved out of root `AGENTS.md` so the root file can stay a
hard-policy index. Load this reference when implementing broad `apps/web` or
shared-package changes.

## Web And Shared UI

- Server Components are the default. Add `'use client'` only for browser APIs,
  local state, or interactivity.
- Client data fetching and mutations use TanStack Query. Do not fetch data in
  `useEffect`.
- Client/shared UI app API calls should go through `packages/internal-api/src/*`
  helpers instead of scattered raw `fetch('/api/...')` calls.
- Every `fetch` inside a query function should include `{ cache: 'no-store' }`.
- Use `@tuturuuu/icons`, `@tuturuuu/ui/dialog`, and dynamic design tokens.
  Native browser dialogs, emojis in UI code, and hard-coded hue classes are not
  acceptable.
- If a client admin surface grows large, keep the main shell focused on query
  state, mutations, and routing; extract heavy render branches nearby.
- If a file exceeds about 400 LOC or a component/widget exceeds about 200 LOC
  after significant edits, split it by concern and keep import paths stable
  with a thin barrel when needed.

## Effect Orchestration

- Import Effect through `@tuturuuu/utils/effect`, not directly from `effect`,
  so Tuturuuu code uses one curated server/service orchestration entrypoint.
- Prefer Effect for new or substantially edited TypeScript server/shared flows
  that coordinate multiple async resources, expected failures, dependency
  services/layers, retry/schedule policy, resource lifetime, or bounded
  concurrency.
- Keep client fetching in TanStack Query and shared app API boundaries in
  `packages/internal-api`; Effect programs can sit behind those boundaries, but
  should not replace query hooks or React state.
- Keep input validation in Zod and generated DB types. Use Effect to compose
  validated operations, not as a replacement for existing schema contracts.
- Use the Tuturuuu helpers (`withTuturuuuRetry`, `withTuturuuuTimeout`, and
  `forEachConcurrently`) for common service reliability policy before adding
  ad hoc retry loops, raw timeout races, or unbounded parallel maps.
- Do not wrap simple pure helpers, formatting utilities, or one-line data
  transforms in Effect unless they are part of a larger Effect workflow.
- Expose adoption through additive subpaths such as `@tuturuuu/ai/effect` or
  `@tuturuuu/trigger/effect`; avoid rewriting stable call sites solely to make
  them Effect-based.

## Routes, Auth, And API Boundaries

- Dashboard routes should stay thin server gates when the UI needs search,
  sorting, pagination, explorer state, or frequent mutation.
- Protected workspace/user CRUD belongs behind `apps/web` API routes and
  `@tuturuuu/internal-api` helpers.
- AI memory access belongs behind `@tuturuuu/ai/memory`, workspace API routes,
  and internal API helpers. Browser code must not call Supermemory directly or
  receive server-only Supermemory credentials.
- Browser AI chat surfaces that stream through `/api/ai/chat` must create or
  resume a durable user-owned `ai_chats` UUID before model invocation. Do not
  use prefixed local UI session ids as chat ids; the route must verify requested
  chat ownership before streaming so message persistence and credit deduction
  cannot be split.
- API routes should parse JSON inside a `try/catch` before Zod validation and
  return explicit `400` for malformed JSON.
- Validate UUID path params with shared Zod GUID schemas instead of ad-hoc
  regex checks.
- Initialize Supabase with `createClient(request)` in API routes that must
  honor both web cookies and mobile Bearer tokens.
- When using admin clients after access checks, re-apply explicit workspace,
  owner, or resource predicates before reading or mutating protected rows.
- Admin-backed lookup/status routes must not return workspace, user, invite, or
  resource metadata for `none`/not-authorized states. Build and return resource
  summaries only after membership, a matching invitation, or the route's
  intended authorization proof has succeeded.
- Routes that proxy local helpers, model runtimes, or upstream providers must
  not copy raw upstream `detail`, stderr, traces, URLs, filesystem paths, or
  credential-bearing diagnostics into browser JSON. Return a generic public
  message and log sanitized server-side context instead.
- Dynamic-programming aligners in request-time routes must enforce explicit
  cell budgets and safe fallbacks before allocating trace matrices from
  user-controlled transcripts, tokens, or model output.
- For nested route resources, bind the child row to all trusted parent route
  params in the same admin query, such as `wsId + groupId + postId`. Do not load
  by child ID first and rely on a separate parent lookup or an empty related RPC
  result to prove tenant ownership.
- Admin-backed user-group course module routes must verify workspace
  membership, require `manage_users`, validate the group with `ws_id`, and keep
  update/delete predicates bound to the module's original `group_id`.
- Personal task-board external reads can hydrate candidate source tasks with an
  admin client, but they must re-filter every source workspace through the
  request user's `workspace_members.type = 'MEMBER'` rows before returning
  default or placed external cards. Guest source membership is not sufficient
  for personal-board task data.
- Forward request auth when server-side loaders call internal API helpers.
- Keep password login, OTP send, OTP verify, MFA verify, and reauth verify on
  throttles that do not write hard IP blocks for shared-IP classrooms and
  centers. Do not route human auth or backend-service `429`s into
  `recordSuspiciousApiRequestEdge`/`blockIPEdge`; preserve `Retry-After`, retry
  only idempotent `GET`/`HEAD` `429`s in the fetch interceptor, and rely on
  per-email cooldown/failed-attempt controls for account-specific abuse. Generic
  anonymous scanner traffic, malformed auth-cookie abuse, `api_auth_failed`, and
  manual blocks can still hard-block IPs. For a live incident, check the
  customer public IP in Abuse Intelligence, clear confirmed false-positive
  blocks, and add a time-bound IP/CIDR trust or rate-limit uplift only when
  traffic is organic.
- Treat workspace/resource IDs embedded in rich-text documents, Yjs payloads,
  mention nodes, or other user-authored content as untrusted hints. Resolve
  stale content through the current route/document workspace or a server-returned
  resource workspace, not through the embedded attribute alone.

## TanStack Start Migration (apps/tanstack-web)

- Shared `@tuturuuu/ui` clients import Next-only framework APIs. apps/tanstack-web
  resolves them at runtime via three compat layers so ported routes keep the
  shared imports AS-IS (no source rewrites):
  - `next/navigation` -> vite `resolve.alias` to
    `src/lib/platform/next-navigation-shim.tsx` (useRouter/usePathname/
    useSearchParams/useParams/redirect/notFound on TanStack Router).
  - `next/link` -> vite `resolve.alias` to `src/lib/platform/next-link-shim.tsx`
    (renders identical `<a href>`, upgrades plain internal left-clicks to SPA
    navigation).
  - `nuqs` (useQueryState/useQueryStates) -> the OFFICIAL
    `nuqs/adapters/tanstack-router` `NuqsAdapter`, mounted in `__root.tsx`
    `RootComponent` (inside router context). Prefer this first-party adapter
    over a hand-rolled shim.
- nuqs gotcha: the TanStack adapter reads URL state from router `state.search`
  (filtered to watched keys) and writes via `navigate({ to: pathname + query })`.
  So a route hosting nuqs hooks MUST let its nuqs-managed query keys pass through
  TanStack Router `validateSearch` — a strict whitelist that drops unknown keys
  silently breaks nuqs reads. Pass through unknown keys (or include the nuqs keys
  in the route's search schema).
- Auth-gate ported routes fail closed: call `requireCurrentUser({ locale,
  nextPath })` FIRST in the loader (before workspace resolution), so anonymous or
  unreachable-backend requests redirect to `/{locale}/login?nextUrl=...` with the
  original `/{wsId}/{route}` path preserved. The unauthenticated redirect is
  covered offline by `e2e/dashboard-auth-gate.noauth.spec.ts`.
- Route porting is gated on backend readiness: a route is portable only when an
  EXISTING `@tuturuuu/internal-api` reader already ships all its data. Raw
  `fetch('/api/...')`, `/internal/...`, or direct `@tuturuuu/supabase` client use
  is rejected by `scripts/check-tanstack-api-access.js` — wire an internal-api
  facade instead, or leave the route for the backend wave that builds the reader.

## Cache Components (every Next app)

`createTuturuuuNextConfig` enables `cacheComponents` (PPR) for every app —
`isTuturuuuNextCacheComponentsEnabled()` returns `true` unconditionally, and no
app opts out. Two consequences bite hard:

- `export const dynamic` / `export const revalidate` are **rejected at build
  time**. `await connection()` is the only opt-in to request-time rendering.
- Supabase-js issues `fetch()` under the hood, so **every server-component query
  is a fetch**. A page with no dynamic signal gets prerendered, and that
  prerender runs with **no cookies** — so `getWorkspace` finds no principal
  ("Workspace not found: personal") and the in-flight fetch is aborted
  ("During prerendering, fetch() rejects when the prerender is complete"). This
  took down contacts in production.

Rules:

- Add `await connection()` as the first statement of any authed page/layout that
  touches Supabase, `getPermissions`, `getWorkspace`, or the app session. A
  dynamic layout does **not** make its child pages dynamic — each page needs it.
- `cacheComponents` also prerenders **GET route handlers**. A Supabase-backed GET
  route with no dynamic signal is statically generated and its response baked in
  at build. Add `await connection()` there too; every API route should report
  `ƒ (Dynamic)` in the build output.
- Prefer the PPR shape where it fits: a static shell with the dynamic part in
  `<Suspense>` and `await connection()` *inside* the suspended component
  (`apps/meet/[planId]` is the reference).
- Unit tests invoke pages/handlers outside a request scope, where `connection()`
  throws. Stub it in the app's vitest setup, keeping the real module:
  `vi.mock('next/server', async (o) => ({ ...(await o()), connection: vi.fn() }))`.
- `bun check` cannot see any of this. Run the app's real `bun run build`.

## Satellite Apps (contacts, pay, tasks, …)

- **Actor resolution**: registered satellites must use
  `getSatelliteAppSessionUser('<app>')`, never `@tuturuuu/utils/user-helper`
  (`getCurrentUser` / `getCurrentWorkspaceUser` read Supabase auth directly). When
  a shared helper needs the actor, give it an injectable `userId` rather than
  letting it resolve one — `@tuturuuu/utils/workspace-user-link` is the pattern
  (`getCurrentWorkspaceUser` delegates to it, so web is unchanged). The
  `internal-app-auth` guard in `bun check` enforces this.
- **Never** add a catch-all page under `[locale]/[wsId]`. Next checks `fallback`
  rewrites only AFTER dynamic routes, so `[wsId]/[...slug]` matches
  `/api/v1/workspaces/...` as `locale="api"`, `wsId="v1"` and shadows the
  `/api/:path*` → web proxy — every proxied API call 404s with
  `workspaceId: 'v1'`. Put non-migrated-route redirects in `proxy.ts` middleware,
  which returns early for `/api` and therefore cannot shadow the proxy.
- Route ownership is an explicit list (contacts: `CONTACTS_OWNED_ROUTE_PREFIXES`).
  Add an entry when you migrate a module, or the middleware bounces the new route
  straight back to web. Beware prefix-vs-exact: a bare `users` entry that
  prefix-matches makes every `/users/*` path look owned.
- **Actorless workspace calls are the #1 satellite production bug.**
  `getWorkspace(id)` and `getPermissions({ wsId })` with no actor fall back to a
  cookie-backed Supabase client — **anonymous** on a satellite domain, where the
  session is an app-session JWT. The lookup returns null, the page 404s
  (`Workspace not found: personal`), and the aborted render leaves Supabase
  fetches in flight that surface as `HANGING_PROMISE_REJECTION`. That digest is a
  *symptom*: do not go hunting for a stray `after()`/`setTimeout` — there isn't
  one. Give the app a `src/lib/workspace.ts` that resolves the actor once
  (`getSatelliteAppSessionUser`) and threads it through
  `getWorkspace(id, { useAdmin: true, user })` / `getPermissions({ user, wsId })`.
- **A satellite must not use `@tuturuuu/ui/custom/workspace-wrapper`** — it calls
  bare `getWorkspace(wsId)` internally, so every page rendering it inherits the
  bug above (it broke all 20 contacts users pages). Use an app-local wrapper built
  on the app's `src/lib/workspace.ts`. `check-internal-app-auth` enforces both
  halves; the actorless rule is per-app via `ACTORLESS_CHECK_APPS`.
- A satellite that renders broad shared UI must be in the **checked** `APPS` list
  in `scripts/i18n-namespace-check.js`, not `UNCHECKED_APPS`. Scanning only the
  app's own source cannot see namespaces used *inside* `@tuturuuu/ui` /
  `@tuturuuu/satellite`, so a missing one surfaces as a runtime
  `MISSING_MESSAGE` instead of a CI failure.
- Having the namespace is **not enough — it can be half-empty**. The shell
  components (`user-nav-client`, `sidebar-structure-header`, `workspace-select`,
  `settings-dialog-shell`) use a bare `useTranslations()` then `t('common.x')`.
  With no namespace argument the key scan can only require such keys from apps in
  `BARE_ROOT_KEY_APP_SCOPES` — `common` was scoped to none, so contacts passed the
  check while missing 850+ keys and shipped `MISSING_MESSAGE` to production. Apps
  rendering the full shell belong in `BARE_ROOT_KEY_FULL_SCOPE_APPS`.

## Moving A Feature Between Apps

Resolve imports to **absolute paths** before moving anything — a `from '@/'` grep
is not enough, and every trap below cost a broken build or a failed test:

- **Relative-sibling** imports (`../../x`) are invisible to a `@/` grep.
- **Dynamic** imports — `await import('@/...')` has no `from` clause.
- **Side-effect** imports — `import '@/lib/dayjs-setup'` has no `from` clause.
- **npm deps of the extracted file** must be added to the *target package*
  (`nuqs`, `react`, `@tuturuuu/storage-core` all bit us).
- **`vi.mock` paths silently break**: a web test that mocks
  `@/lib/require-attention-users` stops intercepting once the extracted module
  imports the users-core copy directly, so the real module runs unmocked.

Then classify each external dependency:

- Already a re-export shim of a package → rewrite to the package.
- Used only by the moving module → move it along (a satellite maps `@/` to its
  own `src`, so the specifier often needs no change at all).
- Still used by the origin app → extract to `@tuturuuu/users-core` (server) or
  `@tuturuuu/users-ui` (client) and point both apps at it. Keep a re-export shim
  in the origin app when many files import it; repoint directly when few do.
- Mutually coupled modules (reports ↔ groups) must move **together**; preserving
  their relative layout keeps every cross-import valid unchanged.

Finish with: `connection()` on data pages, the owned-routes list, the origin app's
nav entry, i18n backfill, the tanstack page-override + manifest + doc counts, then
`bun check` **and** a real `next build`. Deleting pages from `apps/web` leaves
`apps/web/.next/types/validator.ts` stale — `rm -rf apps/web/.next`.

## Migration Debt Avoidance (web + backend + tanstack-web)

The `apps/web` → `apps/backend` (Rust) + `apps/web` → `apps/tanstack-web` switch
is in progress. Do NOT add debt while it is pending — treat the three apps as one
system on every change:

- `apps/backend` is a future migration target only. It is not deployed and does
  not serve current production traffic; `apps/web` remains the live API source
  of truth. A Rust route marked migrated means source parity is ready, not that
  production requests reach it.

- Adding/changing an `apps/web` API route: if `apps/backend` already implements that
  path, update the Rust handler in the same change (faithful status/body/cache;
  GET first, `None` for un-ported methods). If not, register/refresh it in
  `apps/tanstack-web/migration/route-overrides.json` and run
  `bun migration:tanstack:manifest` so it is tracked, not invisible.
- Adding/changing a dashboard page/route: keep the manifest accurate and route
  shared data through `packages/internal-api` so the later TanStack port is a
  move, not a rewrite.
- Confirm backend route ownership with the runtime coverage probe in
  `apps/backend/AGENTS.md`. Full reference + cache classes:
  `apps/docs/platform/architecture/tanstack-rust-migration.mdx`
  ("No New Debt While The Switch Is Pending"). The cheapest correct unit is GET
  reads ported behind an `internal-api` facade.

## Translations And Navigation

- Add, remove, or replace translation keys with `bun i18n:add --app <app>` or
  `bun i18n:add --all` plus `--mode add|remove|replace`; use `--entries` or
  `--entries-file` for bulk updates so every detected locale file is updated
  and sorted together.
- Shared UI translation keys must exist in every app-level bundle that ships
  that shared UI.
- Reserve manual message JSON edits for broad prose rewrites or value-only updates,
  then run `bun i18n:sort`.
- Dashboard routes require navigation aliases, children, icons, and permission
  updates in the owning app navigation file.

## UX Density Patterns

- Dense admin editors should keep one summary/editing surface and move heavy
  item editing into a dedicated route, sheet, or near-fullscreen dialog.
- Avoid duplicating the same editor inline and in overlays.
- Preview/admin hybrids should use explicit Preview/Edit modes instead of
  layering admin chrome over the delivered visual surface.
- Visual content indexes should use one full-width gallery/list and route depth
  elsewhere instead of squeezing gallery and detail preview columns together.
- Keep repeated action labels scoped in tests with `within(...)` when multiple
  zones intentionally expose the same command.
