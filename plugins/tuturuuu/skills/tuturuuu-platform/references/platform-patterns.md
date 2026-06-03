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
- Treat workspace/resource IDs embedded in rich-text documents, Yjs payloads,
  mention nodes, or other user-authored content as untrusted hints. Resolve
  stale content through the current route/document workspace or a server-returned
  resource workspace, not through the embedded attribute alone.

## Translations And Navigation

- Add user-facing strings to both English and Vietnamese bundles.
- Shared UI translation keys must exist in every app-level bundle that ships
  that shared UI.
- Run `bun i18n:sort` after editing message JSON.
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
