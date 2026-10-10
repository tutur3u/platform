# Platform Patterns

These patterns were moved out of root `AGENTS.md` so the root file can stay a
hard-policy index. Load this reference when implementing broad `apps/web` or
shared-package changes.

## Web And Shared UI

- Private saved-reference filters should operate only on the current authorized
  projection. Do not recover withdrawn titles from identifiers or historical
  caches. Keep filters ephemeral and reset their component boundary on actor
  changes, while preserving actor-scoped query and mutation keys. See
  [Lettin saved libraries](../../../../../apps/docs/platform/features/lettin.mdx).

- Private creative previews must distinguish local edits from saved publication
  snapshots. Render only the selected authorized snapshot, reset to the draft on
  reopening, and disable the published choice after unpublishing. A stored
  snapshot does not establish live reader access; retain parent publication and
  media permission checks. Preview controls must not implicitly save or publish.
  See [Lettin previews](../../../../../apps/docs/platform/features/lettin.mdx).

- For public catalogue facets, filter the published snapshot in the authoritative
  query before applying pagination and its next-page sentinel. Keep URL filters
  through search and paging, and share bounded validation between the page and
  API. Expanding a summary projection must still exclude unpublished drafts and
  entry documents. Cover exact matching and snapshot isolation with the local
  store fixture; see [Lettin discovery](../../../../../apps/docs/platform/features/lettin.mdx).
- For cross-app creative handoffs, prefer canonical source IDs over embedding
  private draft text in navigation URLs. Authenticate with the destination app's
  own session and retain its API permission checks. Persisting even a private
  source link into a shared destination needs explicit, initially unchecked
  consent and a clear statement that the link grants no source access. Keep
  source-reading and publication operations separate. See the
  [Lettin product decision](../../../../../apps/docs/platform/features/lettin.mdx).

- For a customer-facing behavior fix that spans apps, trace the setting from its
  writer through server-prefetched and client-only views, summary counts, and
  exports. Share the decision logic when possible, and record the scope, default,
  and deliberate exceptions in the owning `apps/docs/platform` feature page.
  Verify the maintained Next.js app surfaces against that decision. Rust and
  TanStack Start are paused; do not update their implementations until resumed.
- TanStack Query keys must identify the cached value's shape. A raw workspace
  config string and a parsed attendance boolean cannot share
  `['workspace-config', wsId, configId]`: navigating between settings and the
  attendance roster can reuse the wrong type. Use a distinct parsed-value key
  and invalidate it when the raw setting changes.
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
- **Tiptap extensions are fixed at editor creation.** `Editor.setOptions({
  extensions })` only refreshes editor props — it does **not** rebuild the
  extension manager or schema (verified in `@tiptap/core` 3.28), so "attach the
  Collaboration extension once the provider connects" silently does nothing. The
  only way to change a binding after mount is `useEditor(options, deps)` with the
  binding in `deps`, and only identity-stable values may go there (a
  `collaborationUser` object literal would rebuild the editor every render). When
  collaboration is on, content lives **only** in the Yjs doc: the `content` prop is
  ignored, so an editor that was created before collaboration turned on shows an
  empty document forever — and that empty document then reads as an unsaved local
  edit ("a tracked description version is available", "still syncing" on close).
- Keep that `deps` array as narrow as correctness demands — **the Yjs document
  only**. A rebuild tears down the ProseMirror view (losing selection and scroll)
  and re-runs the Yjs binding over the whole document, which is a visible hiccup
  on a large one. The provider only feeds `CollaborationCaret` (cosmetic remote
  cursors) and is normally already present when the subtree mounts, so it does not
  justify rebuilding a live editor.
- Do not mount a collaborative editor against a placeholder record. Render a
  skeleton until the real row has hydrated, so the editor is created once with its
  final binding (`isHydratingTask` in the task dialog is the reference).
- Task-description recovery compares documents through the active editor schema,
  with a lossless check for supported nodes, marks and attributes before schema
  normalization. JSON key order and filled defaults are not a recovery conflict.
  Reconcile banner metadata when history matches both saved content and the
  initial hydrated editor baseline, or a causally confirmed same-opening save;
  never auto-restore history into a live Yjs document. Keep pre-clear history and
  genuine divergence available for explicit restore. The task-dialog loading
  shell hides/inerts pending content while preserving the mounted editor binding.
  Browser layout checks must include delayed hydration, a short description,
  long-content scrolling and reopening; fixtures do not prove live transport.
- **A fixed-height `DialogContent` needs its content column to declare
  `min-h-0`.** The shared default variant is `display: grid`; a grid item defaults
  to `min-height: auto`, so a `flex-1` column inside it grows to its content
  instead of the dialog. The inner `overflow-y-auto` region is then sized to the
  content too, the dialog clips the overflow, and **nothing scrolls at all** — the
  focused task dialog shipped that way (`TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME`).
  The fullscreen variant escaped it only because it lays out with flex. jsdom does
  not compute layout, so no unit test can catch this: assert the class contract
  instead, and verify real scrolling in a browser.
- **Never register a service worker an app does not serve.** `OfflineProvider`
  registers `/serwist/sw.js`, which only exists in apps that also expose
  `src/app/serwist/[path]/route.ts` (`createOfflineRoute`). Copying a layout
  without that route logs a failed registration on every page load; seven apps had
  drifted that way. Either add the route or pass
  `<OfflineProvider register={false}>`. `bun check` → `offline-worker-wiring`
  enforces it.
- **Never copy the multi-account vault into another app.**
  `apps/web/src/lib/auth/multi-account` (device cookies, encrypted Supabase
  sessions, the account-switch handover) belongs to the app that serves
  `/api/v1/auth/accounts/*`, which is only `apps/web`. `apps/infrastructure`
  carried a byte-for-byte copy with no consumers: nothing imported it, so
  nothing tested it and nothing broke when it drifted — it was hand-synced once
  during a cross-app change and then missed two production auth fixes while
  still reading as live code. If another app needs the behavior, extract it into
  a shared package. `bun check` → `multi-account-vault-owner` enforces it.
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
  honor both web cookies and mobile Bearer tokens. **`createClient(request)` is
  not enough for a route satellites proxy** — see the app-session bullet under
  Satellite Apps; it returns an intentionally unauthenticated client as soon as
  the request carries an app-session cookie.
- New or substantially reworked web API routes belong in
  `apps/web/src/app/api/**`, not `apps/web/src/legacy-api-routes/**`. Moving one
  out means `git mv` route + colocated test, deleting the legacy file (so
  `bun web:api-routes:check` stops wanting a generated wrapper), re-keying the
  active live route references. Rust/TanStack migration manifests are frozen;
  do not refresh them until explicitly resumed. Validators that scan web
  API routes must cover **both** trees — `check-workspace-member-type-guard`
  scanned only the legacy tree, so a moved route would have escaped it.
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

Retained inactive reference: do not execute or update this runtime until explicitly resumed.

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
- `bun check` cannot see any of this. Require the app's real CI build on the
  exact PR head; do not run builds on this machine.

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
- **The mirror image of that bug lives in `apps/web`.** A web route that
  satellites proxy must opt into app-session actors. `createClient(request)`
  short-circuits to a deliberately *unauthenticated* isolated client the moment the
  forwarded request carries the host-only `tuturuuu_app_session` cookie, so
  `resolveAuthenticatedSessionUser` / `getPermissions({ request })` find no user
  and the route answers `401 Unauthorized` — from every satellite, while the exact
  same code keeps working on tuturuuu.com. Opt in explicitly:
  `resolveWorkspaceRouteAccess(request, wsId, [permissions])` for workspace routes,
  or `withSessionAuth(handler, { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH })`,
  then authorize on workspace permissions (the actor's app grants nothing). A
  narrow per-app allowlist such as `{ targetApp: 'teach' }` silently 401s every
  other app, so widen it when a second app starts calling the route.
  Symptom to recognise: **one action inside an otherwise-working panel fails while
  its neighbours succeed** — workspace member invites 401'd from every satellite
  while the member list, roles, and invite links all worked, because those had been
  migrated and `members/invite` had not. When you fix one route, audit its whole
  surface: `grep -L 'resolveWorkspaceRouteAccess\|allowAppSessionAuth' <route dir>`.
- When moving a read/preview API into a satellite, inject its verified workspace
  access into a shared service rather than importing another app's route or
  trusting forwarded actor headers. Keep the central app's existing access policy
  explicit. A local collection GET also captures unsupported methods: Next returns
  405 before fallback rewrites. Preserve intentionally central collection mutations
  with an exact-method rewrite after the satellite's unchanged session and API
  guards, and test local GET/preview POST, forwarded POST, and denied sessions.
- **The same trap bites satellite API routes, not just pages.** A route that does
  `const supabase = await createClient()` and then passes that client to
  `verifyWorkspaceMembershipType` (or any RLS-scoped authorization query) denies
  every app-session caller: the cookie client is anonymous, the membership row
  comes back empty, and the route answers 403 or "not found". It reads as missing
  data, not as an auth bug, which is why it shipped three times — satellite member
  invites, every cross-workspace task deep link, and a dozen tasks/pay endpoints.
  Resolve the actor with the app-session-aware helper and authorize with the
  client it returns, or with an admin client filtered by the authenticated user id
  (then keep explicit `ws_id`/owner predicates on the data queries, since admin
  bypasses RLS). `bun check` → `satellite-cookie-auth` enforces it.
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
nav entry, i18n backfill, active docs inventory, focused non-build checks, and
exact-commit CI type/lint/test and real Next build evidence. Do not update paused
migration manifests. Deleted Web pages can leave generated `.next/types` stale;
refresh generated type evidence through the owning supported CI path.

## Active runtime and paused implementations

Web and satellite Next.js apps are maintained. Rust (`apps/backend`) and
TanStack Start (`apps/tanstack-web`) are paused and not in use. Do not port
changes, regenerate migration trees/manifests/version docs, run implementation
checks/builds, or update their dependencies until explicitly resumed. Maintain
live Web first-class API handlers and shared `packages/internal-api` boundaries.
Docker setup is inactive and the Docker cron runner is retired; local docs use
`bun dev:docs` without Docker. See `apps/docs/build/devops/active-runtime.mdx`.

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


## Bounded billing projections

Treat a schedule response as authoritative only within its explicit civil-date
window. Replace legacy dates inside that window, including for a present empty
group list; retain dates outside it. Missing keys, pending reads and failed or
malformed receipts cannot authorize invoice creation. Validate nullable linked
inventory relations from the actual RPC/route shape before rendering or billing:
block the full create action and handler with an actionable instruction rather
than omitting a charge or substituting an arbitrary unit. Preserve cancellation,
coverage and historical records. Exercise the real internal-api mapper and form
admission in regressions; application builds and customer runtime verification
remain separate delivery evidence.

## Search and documentation ownership

Every maintained Next app declares `seoApp` in the shared Next config. Public
URL patterns are explicit; other paths receive HTTP noindex, including auth/API,
workspace, embed, shared-link, and buyer transaction responses. Public forms keep
their author/access-aware metadata controls. Keep robots crawlable so noindex
and redirects can be observed. Regenerate static app assets with
`node scripts/generate-app-seo.js`; Web retains its publication-aware sitemap.
See `apps/docs/platform/features/search-indexing.mdx` and
`apps/docs/build/development-tools/seo-strategy.mdx`.

Docs inventory refreshes with `node scripts/generate-docs-inventory.js` and is
checked with `--check`; inactive Rust/TanStack sources are excluded. Product
guides explain actual behavior and access, while generated routes locate source.
Use `node scripts/docs-audit.js` for navigation, internal links, and assets.

## Managed artwork collections

Adding artwork outside rich text requires updating the atomic draft artwork guard
and auditing media publication and retention together. Lettin gallery items use
the existing `image` JSON key, so published media lookup and recursive cleanup
retain the same permissions without a new storage policy. Exclude collection
payloads from discovery projections and test draft edits against older published
snapshots with real local D1/R2. Keep upload operations tied to the editor lease,
block save/discard/publish while pending, and reject stale results after unmount.
When integrating saved-draft duplication, exercise collection artwork ownership
inside its insert fence, including retirement between the source read and insert.
## Duplicating creator drafts

Duplicate from a server-owned saved revision, with explicit destination scope and
a user-supplied title. Recheck source revision, creator/collaborator permission
and artwork ownership in the insert, rather than trusting an earlier read. Keep
copies unpublished and clear structured references whose semantics should not
transfer. A completion callback must not navigate away from edits made while the
request was pending: offer a separate guarded open action. Fence double submits
synchronously and avoid automatic retries for non-idempotent creation.
Lettin's duplicate-entry D1 and component tests exercise these boundaries.

## Notification email admission

Immediate and batched notification email share `notifications/cron-helpers.ts`
and `email-eligibility.ts`. Keep recipient-domain admission separate from the
intentional root-workspace rollout. External account destinations require a
matching confirmed Auth email; never infer verification from a queued or profile
address alone. Recheck current email preferences for each queued event through
`should_send_notification`, including account channel/category opt-outs, before
rendering a digest. Lookup failures must stop admission.

Keep EmailService suppression authoritative and do not request a blacklist bypass.
Transactional account updates and dedicated auth/recovery mail must not inherit a
marketing opt-out accidentally. The source matrix and sender fixtures live in
`email-eligibility.test.ts` and the notification route tests. See the recipient
policy in `apps/docs/platform/architecture/authorization.mdx`; focused fixture
success is separate from exact-head CI and actual provider/inbox delivery.


## Saved versus published browsing

Creator search/filter controls operate on authorized saved drafts; public search
must operate on the published-only projection. Never pass private search indexes
or draft-change indicators to reader surfaces. “Published” and “saved changes”
are overlapping states, not mutually exclusive. Compare structured document
values rather than serialization key order. Apply relationship facets to both
endpoints before edge text search, and preserve semantic timeline ordering when
adding card sorts. Keep dirty-editor navigation guards and clear-filter recovery
in real component regression coverage.

### Local reference pickers

When a creator edits references among already-authorized notebook records, derive
search results from the supplied collection rather than adding broader source
reads. Keep search/kind filters transient, batch large lists, and require an
explicit target action. Fence self references, duplicate target/type pairs and
collection limits both in options and the update helper. Do not silently drop
unavailable references: retain their labels until explicit removal. Preserve
other draft fields and use the existing Save permission/revision boundary.
Lettin's `relationship-authoring-model.test.ts` and
`wiki-relationships-editor.test.tsx` exercise this contract; local DOM acceptance
remains distinct from hosted browser and publication verification.

## Private reader references

Social saves must not silently become public profile data or popularity signals.
Store actor-owned source IDs instead of private document copies; project live
published card fields when reading and return unavailable references after
unpublishing. Bound insertion quotas atomically, make explicit save/remove
idempotent, and bind both reads and writes to the expected app-session actor.
Include the actor in client cache keys. Standalone library routes must be excluded
from workspace-alias probes and use request-time suspended auth boundaries.
Lettin's bookmark D1 and route regressions cover these contracts.

## Derived reader document navigation

Derive reader outlines from the selected published projection, not workspace
queries or editor buffers. Match the renderer's tree paths, depth cutoff and
ignored leaf children when assigning bounded navigation targets. Plain labels
must escape markup and exclude author IDs/link/image metadata. Scope targets per
document and keep duplicate heading titles distinct. Open enclosing folds before
focusing/scrolling, respect native modified clicks, and avoid forced motion or
history churn. Record that tree-position targets can change after republishing;
DOM fixtures verify actions and boundaries, while real layout/focus remains a
hosted browser gate.

## Creator-authored guidance

Keep advisory creation metadata separate from access grants and profile sharing.
Bound plain-text fields in the server draft schema and validate enumerated
preferences; no choice should mutate collaboration roles. Save and publish through
existing revision/permission fences, exclude long guidance from catalogue
projections, and test later edits/clearing against older published snapshots with
real local D1. Source copies can retain authored metadata only within their
explicit private-copy scope. Review portability allowlists independently.

## Reports dashboard totals

Contacts shares Daily semantic report status cards with Periodic. Daily totals count
recipient rows; Periodic totals count report records. All periodic excludes Daily
because these units differ. Preserve legacy view/report filter URLs and independent
Daily/Periodic date/status scopes. Server totals and categories must use the same
complete active predicate as rows, before pagination. Never display loaded-row
category counts or stale/unknown totals as zero. Ordered scans must reject incomplete
count receipts and duplicate IDs; scopes above their explicit read bound require
narrowing instead of truncated totals. Preserve 100-report delivery selection and
actor/scope epochs. See `apps/docs/platform/applications/reports.mdx` and the focused
report-list/query and panel-counts regressions.


## Parley practice and Meet handoff

Parley shares the Meet runtime but owns discovery, scenario selection and private
facilitator review. A review link must resolve the `meet` app origin explicitly:
the shared runtime’s `BASE_URL` points at Parley when running there. Participant
invitations must instead remain on the current Parley origin at `/r/<code>`,
never `/sessions/<id>`. Codes do not confer authorization.

Reset participation acknowledgement when switching the selected scenario. Keep
the selection visible when search filters hide its option. Load saved private
rubrics only after both session-owner and meeting-host checks; render the session
snapshot rather than the current scenario revision. See the Parley product guide
and studio setup, invitation, review-route and Meet-link regression tests.


## Immediate notification selection

Read immediate request bodies after authentication with the256KiB/4096chunk
stream bound before JSON parsing, cancel overflow and return413 before database
work. Preserve400 malformedJSON and original transport errors. Count empty-chunk
no-progress reads as operations; byte limits alone do not bound chunk loops.
Apply a10second total incoming-body deadline and return408 before deliverywork.
Do not renew it on chunks or await an uncooperative cancellation; clear timers
on every exit and retain original overflow/transport errors. Cover stalled/drip
streams, exact deadlines, cancellation hangs and zero provider/database calls.
Explicit immediate batch_ids requests accept at most100 IDs with existing
single-ID length bounds; select deduplicated IDs using one capped private-schema
query. Unrequested batches remain pending. Preserve complete logs and atomic
provider-in-flight reconciliation. Empty-body automatic draining retains complete
pagination: capping its oldest window before rollout filtering can starve later
eligible deliveries. Add durable rollout-aware progress before bounding that path.
A request bound does not cap logs, devices, automatic prefetch or total spend.
See the Cron Control runbook and immediate-selection/request-budget regressions.
## Colab expiry runtime regression

Colab stores its completed expiry deadline in private state row3, atomically with
room/audit writes. Keep schedule extensions independent and preserve existing room
modes/end events. Use `apps/colab/src/server/room-alarm.test.ts` for bounded-operation,
duplicate/restart/deadline regressions and
`node --test apps/colab/scripts/verify-expiry-runtime.mjs` for the real local Worker
and SQLite transaction behavior. Queue local execution with `ttr resources run`;
use a private writable TMPDIR when shared temporary storage rejects writes. The
fixture uses isolated configuration, loopback requests and no production bindings;
its harness closes after tests. RPC handler invocation does not prove hosted alarm
delivery or automatic retry semantics. See the Colab feature page for cost units
and remaining acceptance evidence; release builds stay in CI.

## Typed quick capture

Reuse the existing notebook entry-kind list and authorized create command for
plain text capture. Default to a page, retain the selected kind on failure, and
reset it only after successful capture or context replacement. Keep pending and
dirty-editor fences on every input, including kind selection. Do not inject
structured starter metadata or publish captured entries implicitly. Cover the
supported kinds against the draft schema, translated rendered labels and actual
D1 publication/workspace/revocation boundaries; local fixtures do not establish
hosted dialog acceptance. See the Lettin feature decision and quick-note tests.

### Local D1 quota fixtures

Seed large boundary datasets with a set-based SQL statement and assert the exact
seed count before testing concurrent production mutations. Hundreds of separate
prepared statements in a fixture batch can exhaust the per-test timeout under CI
load without exercising more application behavior. Preserve the real mutation,
quota race and cross-actor assertions; do not raise global timeouts or replace D1
with mocks. Catalogue pagination fixtures should seed published snapshots in one
set-based write; preserve separate real publish/save mutation tests and assert the
row count before queries. A timed-out sequential seed can keep running and contaminate
the next test even when its cleanup hook ran. Lettin's creator-bookmark quota regression uses 499 seeded references
and two concurrent saves to verify the 500-reference boundary.

## Scoped artwork reading dialogs

Use the already projected gallery item and its validated media URL for a larger
reading view. Preserve alt text, caption and credit; use accessible dialog titles,
localized close controls, focus return and Escape behavior. Keep the dialog closed
until the reader asks to open it. Direct media URLs preserve revocation checks;
do not introduce optimizer caches, download endpoints or permission changes.
In jsdom, assert the rendered referrer-policy attribute and allow the shared
Radix focus scope's deferred unmount callback to settle before asserting focus
return; keep the actual dialog interaction rather than replacing it with a mock.

### Published outline search

Filter only the current bounded displayed heading labels, with Unicode/case
normalization and a bounded ephemeral query. Keep full content and truncation
feedback intact. Reset local search when labels or scoped targets change; isolate
articles and retain disabled private-preview defaults. Clear/empty recovery must
keep heading navigation and enclosing-fold focus behavior. Do not search source
IDs, omitted content, drafts or unavailable projections, or persist reader queries.
Coverage: `document-outline-search.test.tsx`.

### Public profile projections

Public profile reads must use explicit query and response allowlists, independent
of authenticated current-user DTOs. The default visible identity is avatar,
banner, display name, and biography. Saving or publishing a notebook does not
consent to sharing other profile details. Owning app surfaces must persist an
explicit sharing choice, default legacy records to private, and enforce it on
server reads and metadata. Lettin About sharing is separate from canonical
account identity; see the profile decisions in the Lettin and user-management
feature docs and their projection/privacy regression tests.

## Date-only creator planning handoffs

For navigation-only ecosystem integrations, use registered app origins and carry
only the minimal explicitly chosen navigation value. Validate Gregorian day
strings without rollover or server timezone conversion; keep notebook IDs and
private text out of a date-only Calendar handoff. Destination session/workspace
permissions remain authoritative. Block navigation during unresolved editor
changes and reset context-local selections together with their owning context.
See the Lettin Calendar decision and URL/rendered regressions.

## Reviewing collaborator capabilities

Stage owner access changes with immutable member IDs and workspace/notebook
context. Describe edit/publication capabilities explicitly before confirmation;
recheck current eligibility and ownership without treating UI checks as authority.
Cancel sends no command, failure preserves review, and a synchronous submission
fence prevents duplicate clicks before mutation state rerenders. Reset controls
on context changes. Recipient acceptance is a distinct workflow; do not claim
an owner confirmation establishes recipient consent. Lettin's collaborator DOM
and D1 role/revocation regressions cover these boundaries.

## Staging a published snapshot as a draft

Keep snapshot restoration separate from persistence and publication. Confirm the
local replacement, clone the available published value, replace the whole draft
rather than merging authored optional fields, and reset tag/rich-text buffers together.
Retain current private workflow labels separately from the public authored snapshot;
never restore historical public labels over current private metadata.
Preserve the last saved draft for local discard. Pending mutations and every cover, inline or gallery upload, together with
source editing, must block restoration, including confirmation after availability
changes. Use existing save commands and actor/workspace/revision/target fences;
staging a snapshot does not revive unavailable references or grant publication.
See the Lettin decision and restore/editor/local D1 regression coverage.
## Published notebook collections

Use only the public snapshot payload when composing reader collections and search.
Keep overview documents, selected-entry URLs, chronological ordering and
relationship-label/endpoint search distinct. Count entries only where that count
matches the displayed collection; do not present entry counts as connection
counts. Empty-filter recovery should reset the visible controls together. Reuse
cards so content notices and published context remain visible before entry
selection. See the Lettin decision and public-entry collection regression.
Context-reset keys must include the control's identity when stateful components
share a parent. Workspace/notebook IDs alone collide between sibling quick-note
and Calendar controls. Lettin's Studio browsing regression checks key warnings,
state retention across section changes and reset on notebook changes.

## Scoped document export

Use explicit publication scope and affirmative owner consent for bulk private
exports, rather than assuming ordinary collaborator reading permission implies
private portability consent. Project through the active document schema, omit
identity/grant metadata, and filter structured references against included IDs.
Bound entry counts and encoded bytes before large reads, then recheck notebook
permissions before response. On the client, reuse the server-verified workspace
actor lifetime and an intent lease to suppress stale downloads after account
change, dialog closure or unmount. State clearly when URLs rather than asset bytes
are exported and when saved reads do not form an atomic database snapshot.


For portable file imports, treat source IDs and export provenance as untrusted
context. Use a schema-projected, actor/workspace-bound expiring preview followed
by explicit apply; allocate fresh IDs and remap only included references. Source
consent never grants access to referenced media. If asset bytes and transfer
permission are absent, remove image and hyperlink targets and explain the loss
before apply. Reuse the private D1 import transaction and fence preview source so
one importer cannot apply another importer's privileged plan. Keep consent,
publication and creator revocation regression evidence separate from hosted CI.

## Explicit public routing links

Public copy/share controls must derive destinations from an already-public server
projection, not `window.location`, arbitrary search values or private workspace
routes. A canonical route helper validates shape but does not grant source access.
Copy only the public routing URL and whitelist supported query keys; avoid actor,
tracking, draft and profile metadata. Do not freeze publication by copying a link.
Use explicit visitor intent, clipboard failure/manual selection recovery, duplicate
submission fences and keyed destination lifetimes to suppress stale completion.
Shared components can receive localized labels from owning apps instead of adding
implicit shared translation keys to unrelated app bundles.

## Private creator workflow metadata

Treat internal drafting labels as distinct from publication status and access
roles. Exclude private metadata in the atomic publication write and again in all
public projection reads, including historical snapshots and nested entries.
Retain the saved draft and existing permission/revision checks. Test real D1
publication plus historical JSON, revocation and workspace fences. Compose studio
filters over saved authorized records, preserve search, and explicitly document
whether relationship filters require both endpoints. Never infer publication from
a readiness label or add it to public profiles.

### Explicit source references on copies

Keep source references optional when copying saved creative records. Derive the
source ID from the already-authorized, revision-fenced record instead of accepting
an arbitrary target. Default the choice off, clear it on reopening, and explain
that later publishing the copy retains the reference ID without publishing
source content or granting source access. Preserve public projection filtering
so unavailable source references remain omitted. Clear inherited graph references and
retain the existing same-notebook, artwork and atomic write fences. Test the
private copy and later published projection independently with real local D1.

## Private document statistics

Derive writing metrics from the current authorized editor buffer without storing
new fields or enriching public projections. Join adjacent inline text but preserve
block boundaries; exclude attributes and ignored leaf children. Use Unicode word
and grapheme segmentation and state the whitespace rule. Label bounded partial
results and unapplied source-mode exclusions explicitly. Count depth-clipped nodes
against the same traversal budget so a wide rejected frontier remains bounded. Memoize against the
content object so metadata edits do not traverse the document again. Lettin's
writing-statistics model and bilingual DOM regressions cover these boundaries.

## Ordered creator properties

Reorder authored array properties in the existing private editor buffer, preserving
values and unrelated metadata. Duplicate labels need position-specific accessible
controls; disable boundary moves and keep keyboard focus with the moved item.
Saving and publishing remain distinct existing revision/permission operations.
Lettin's fact editor DOM and real D1 snapshot tests cover order persistence and
private revisions without introducing storage fields or access grants.

### Creator reference availability previews

Review reference availability from authorized notebook records only. Deduplicate
links and relationship targets; render no raw ID or guessed title for an unavailable
target. Treat a current published target snapshot as availability information,
not reader authorization or an immutable historical version. Keep notebook
publication and server-side reference filtering authoritative. A private preview
must not publish targets, copy private text to readers or grant access. Lettin's
reference review and version-switch regressions cover this boundary.


### Optional localized fact labels

Keep creative fact starters explicit and append-only. Do not replace matching
labels or values, infer personal profile data, or store hidden template metadata.
A localized label becomes ordinary authored text at addition time; changing the
interface locale must not rewrite it. Preserve existing collection limits and
save/publication fences. Lettin's character fact starter, ordering and local D1
regressions cover this behavior.

### Explicit context facts in private copies

Append context metadata only when explicitly requested, validate its bounded
label/value and entry-kind scope, and preserve existing facts rather than matching
or replacing labels. Respect the original collection limit. Keep source-link
consent separate, read the saved source revision, and repeat actor/workspace/media
fences in the atomic copy. Context copies never transfer grants or publication.
Lettin's context-copy D1/UI regressions cover these boundaries.

## Published reader sequences

Derive previous/next destinations from the same filtered public projection used
by the reader sidebar. Hide the controls for an excluded selection or a list
with fewer than two entries; never wrap to another notebook or resolve missing
IDs through private APIs. Reuse the public reader's entry selection/URL handler.
Cover filter changes and both list ends alongside localized accessible labels.

## Session writing aids

Keep optional session targets separate from authored drafts and public projections.
Use the existing keyed editor lifetime to reset local state on source changes.
Count current body content through the bounded Unicode statistics helper; withhold
completion claims while source edits are unapplied or traversal is partial.
Document session-only retention and avoid interpreting a reached target as a save.

## Published entry tag discovery

Build tag suggestions from projected published entry metadata, not notebook tags
or private studio drafts. Keep suggestions bounded while permitting exact manual
input. Apply tag admission before sidebar/collection/sequence and relationship
endpoint filtering; retain selected-document reading without stale neighbor links.
Clear all local reader filters together and test combined search/kind/tag behavior.
