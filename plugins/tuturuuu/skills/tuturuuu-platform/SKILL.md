---
name: tuturuuu-platform
description: Tuturuuu platform monorepo workflow guidance. Use when Codex works in the tutur3u/platform repo or a local Tuturuuu platform checkout, especially for apps/web Next.js changes, packages/* shared code, apps/database Supabase migrations, apps/docs documentation, translations, navigation, TanStack Query data fetching, repo verification, or Conventional Commit/branch follow-through.
---

# Tuturuuu Platform

## Core Workflow

Start by reading the nearest `AGENTS.md` instructions and any task-local docs before editing. Treat those instructions as authoritative for this checkout.

Run `git status --short` before edits. If dirty or untracked files already
exist, assume they belong to the user or another agent unless local evidence says
otherwise. For overlapping or long-running work, use
`$tuturuuu-agent-coordination` and `tmp/agent-coordination/` notes before
touching shared files.

Map the request to the smallest owning surface:

- `apps/web`: Next.js App Router platform UI and API routes.
- `apps/contacts`: `contacts.tuturuuu.com` satellite that owns the whole `workspace_users` CRM surface (`/[wsId]/users/*`, `workforce`); `apps/web` has no users section. Shared logic is in `@tuturuuu/users-core` (server) / `@tuturuuu/users-ui` (client).
- `apps/mobile`: Flutter mobile app.
- `apps/database`: Supabase migrations, config, reset scripts, and pgTAP.
- `apps/docs`: Mintlify docs and team-facing operational guidance.
- `packages/*`: shared UI, types, internal API clients, auth, Supabase helpers, and utilities.

Prefer existing patterns over new abstractions. Search with `rg` before introducing new APIs, types, routes, or copy. If a user-facing change adds, removes, or replaces translation keys, use `bun i18n:add` with the relevant app, `--all` shared UI scope, and single-key or bulk `--mode add|remove|replace` so every locale file is updated and sorted together. Reserve manual message JSON edits for broad prose rewrites or value-only updates, then run the i18n sort/check commands.

## Hard Rules

- Do not run `bun dev`, `bun run build`, `bun build`, `bun sb:push`, or `bun sb:linkpush` unless the user explicitly requests it.
- Do not manually edit `package.json` to add dependencies. Use the package manager command for the owning workspace.
- Do not use native browser dialogs, hard-coded Tailwind color classes, emojis in UI code, client-side raw `fetch('/api/...')`, or `useEffect` for data fetching.
- Do not add `export const dynamic` / `export const revalidate`. Every Next app has `cacheComponents` enabled and rejects them at build time. Opt authed pages and Supabase-backed GET route handlers into request-time rendering with `await connection()` — otherwise they prerender with no cookies and fail at runtime. See `references/platform-patterns.md` → Cache Components.
- In a registered satellite, resolve the actor with `getSatelliteAppSessionUser('<app>')`, never `@tuturuuu/utils/user-helper` (`getCurrentUser` / `getCurrentWorkspaceUser`). The `internal-app-auth` guard in `bun check` enforces this.
- In a registered satellite, never call `getWorkspace(id)` / `getPermissions({ wsId })` without an actor, and never render the shared `@tuturuuu/ui/custom/workspace-wrapper`. Both fall back to a Supabase client that is anonymous on a satellite domain: the page 404s and the aborted render throws `HANGING_PROMISE_REJECTION`. Use the app's `src/lib/workspace.ts` + an app-local wrapper. See `references/platform-patterns.md` → Satellite Apps.
- Never add a catch-all page (`[...slug]`) under `[locale]/[wsId]` in a satellite that proxies `/api/*` to web — it shadows the API proxy. Put non-migrated-route redirects in `proxy.ts` middleware.
- `bun check` does not compile Next apps. After changing an app's routes, pages, or deps, also run that app's real `bun run build`.
- Use TanStack Query for client fetching and mutation. Put shared app API access behind `packages/internal-api/src/*`.
- For schema changes, apply local migrations before typegen when possible, then run `bun sb:typegen`. Prefer DB types from `@tuturuuu/types/db`.
- For route additions, update the relevant `navigation.tsx` aliases, children, icons, and permissions.
- For docs-worthy operational or architectural changes, update `apps/docs` in the same session and add new pages to `apps/docs/docs.json`.

## Implementation Notes

Read `references/platform-checklist.md` for the compact checklist before making code changes. Use it to catch translation, navigation, docs, and verification follow-through that are easy to miss.

Read `references/platform-patterns.md` when the work touches broad `apps/web`,
shared UI, API boundaries, translations/navigation, or dense admin UX patterns
that used to live in the root operating manual.

Use the more focused plugin skills when they match the task:

- `$tuturuuu-database` for Supabase schema, RLS, API write, storage, or generated type changes.
- `$tuturuuu-ci-docs` for workflow files, validators, docs pages, and docs navigation.
- `$tuturuuu-cms-studio` for `apps/cms`, branded external-project adapters,
  landing-page content editing, media workflows, preview delivery, and
  non-technical editor UX.
- `$tuturuuu-external-apps` for branded sibling apps that connect to Tuturuuu
  through app-token exchange, direct signed uploads, external-project APIs,
  delivery payloads, and refreshable admin sessions.
- `$tuturuuu-satellite-app-ux` for standalone satellite apps such as Mail or
  CMS, including app-session auth, i18n, workspace routes, navigation, and
  focused app shells.
- `$tuturuuu-e2e-auth-debugging` for native Playwright, dev-session,
  guest-access, onboarding redirect, app-session verification, and local auth
  E2E failures.
- `$tuturuuu-cli` for installing, using, debugging, or publishing the native `ttr` CLI and browser/copy-token login flows.
- `$tuturuuu-commit` for explicit commit requests, scoped staging, atomic
  Conventional Commits, commit-window coordination, commit-and-push
  follow-through, and commit reporting.
- `$tuturuuu-agent-coordination` for dirty/shared worktrees, active ownership
  notes, archived context, overlapping edits, handoffs, and path-scoped staging
  safety.
- `$tuturuuu-development-tooling` for Codex plugin, skill, validation, docs, scripts, and durable agent workflow improvements.
- `$tuturuuu-web-release` for `apps/web` release metadata, version badge,
  `TUTURUUU_PLATFORM_VERSION`, or blue/green release snapshot fallback work.
- `$tuturuuu-mobile-task-board` for Flutter task-board date, routing, assignee, detail, or version bump work.
- `$tuturuuu-review-comments` for fetching, fixing, resolving, and reporting unresolved GitHub PR review threads.

Use `$tuturuuu-agent-coordination` when the immediate work depends on shared
worktree ownership or overlap handling. Use `$tuturuuu-development-tooling` when
the durable change is about plugin behavior, skill text, validation scripts,
docs runbooks, or repo automation.

If the user asks to add, create, track, or split a Tuturuuu task while working in
this repo, route to `$tuturuuu-cli` and use `ttr` as the source of truth instead
of local notes or GitHub issues, unless the user explicitly asks for those
artifacts.

For web dashboard surfaces, default to thin server gates plus client shells backed by TanStack Query, `@tuturuuu/internal-api`, and `nuqs` when the UI needs search, sorting, pagination, explorer navigation, or frequent mutation.

For protected or authenticated app CRUD from client/shared UI code, add or extend API routes and internal-api helpers instead of reading Supabase directly from client components.

For shared data shapes reused beyond one callback, export them from `packages/types/src/db.ts` and consume them through `@tuturuuu/types`.

When a session reveals durable workflow knowledge, make an incremental
improvement to the relevant Tuturuuu tooling surface when practical: plugin
skill text, `apps/docs`, validation scripts, focused tests, or helper scripts.
Keep the improvement small and tied to the task.

When the user asks to commit, treat the commit as part of the deliverable. Use
`$tuturuuu-commit`, split commits by product domain or independently revertible
scope, claim or wait for the commit window before changing the staged set, and
stage only paths intentionally changed in this session. The commit window is
limited to 5-10 minutes, so claim it only when ready to stage and commit.

## Verification

Scope verification to the files and risk first, then follow repo requirements:

- Run formatters required for touched files before final checks.
- If TypeScript, JavaScript, or root scripts/config changed, finish with `bun check`.
- If messages changed, use `bun i18n:add` for key add/remove/replace work when possible and run `bun i18n:sort` before `bun check`.
- If Flutter localization ARB keys changed, run `flutter gen-l10n` before Flutter analysis or tests.
- If mobile Flutter tests collide on `build/unit_test_assets`, rerun the focused tests sequentially.

When the user asks for review, lead with findings and exact file/line references. When no issues are found, say that clearly and mention residual test gaps.
