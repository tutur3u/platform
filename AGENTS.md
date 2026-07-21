# AGENTS.md - Operating Manual For Autonomous AI Assistants

## 1. Authority

Foundational mandates here take absolute precedence. Never invent ad-hoc
behavior. This file is the hard-policy index for the Tuturuuu platform
monorepo; detailed reusable patterns live in the repo-local Tuturuuu Codex
plugin under `plugins/tuturuuu/skills/*/references/` and in `apps/docs`.

Read the nearest `AGENTS.md` first, then load the focused Tuturuuu skill for the
surface you are changing:

- `$tuturuuu-platform` for general `apps/web`, shared packages, translations,
  navigation, docs, and repo verification.
- `$tuturuuu-web-release` for version badge, release metadata,
  `TUTURUUU_PLATFORM_VERSION`, or blue/green release snapshot work.
- `$tuturuuu-agent-coordination` for dirty/shared worktrees, handoffs, staged
  path safety, coordination notes, and commit-window coordination.
- `$tuturuuu-development-tooling` for plugin skills, validation scripts, root
  scripts, CI, and durable agent workflow improvements.
- `$tuturuuu-database` for Supabase migrations, RLS, protected-table API writes,
  storage policy, generated DB types, and database aliases.
- `$tuturuuu-ci-docs` for GitHub Actions, `tuturuuu.ts`, validators, docs
  pages, docs navigation, and Docker deployment runbooks.
- `$tuturuuu-mobile-task-board` for Flutter mobile task-board behavior and
  mobile release metadata follow-through.
- `$tuturuuu-cli`, `$tuturuuu-cli-tasks`, and `$tuturuuu-cli-finance` for native
  `ttr` workflows.
- `$tuturuuu-commit` for explicit commit/commit-and-push requests.
- `$tuturuuu-review-comments` for GitHub PR review-thread follow-through.
- `$tuturuuu-pr-merge-sync` for PR quiet-window merge follow-through,
  mandatory main-green verification, `bun git-sync`, and production-green
  verification.

## 2. Hard Prohibitions

- Do not run long-running or build/bundling commands such as `bun dev`,
  `bun run build`, `bun build`, or equivalents unless the user explicitly asks.
- Do not run `bun sb:push` or `bun sb:linkpush`; prepare migrations and let the
  user apply production Supabase changes.
- Do not commit secrets, API keys, tokens, credentials, or raw sensitive values.
  Reference environment variables by name only.
- Do not manually edit `package.json` to add or update dependencies. Use the
  package manager command for the owning workspace.
- Do not use native browser dialogs, emojis in UI code, hard-coded hue classes,
  client-side raw app API fetches, or `useEffect` for data fetching.
- Do not add `export const dynamic` / `export const revalidate` route segment
  configs. Every Next app runs with `cacheComponents` enabled, which rejects them
  at build time. Opt an authed page or Supabase-backed GET route handler into
  request-time rendering with `await connection()` instead (see
  `$tuturuuu-platform` → Cache Components).
- Do not resolve actors in a registered satellite app with
  `@tuturuuu/utils/user-helper` (`getCurrentUser`, `getCurrentWorkspaceUser`) —
  those read Supabase auth directly. Use `getSatelliteAppSessionUser('<app>')`
  and pass the id into an injectable helper (e.g.
  `@tuturuuu/utils/workspace-user-link`). `bun check` enforces this via the
  `internal-app-auth` guard.
- Do not add a catch-all page (`[...slug]`) under `[locale]/[wsId]` in a
  satellite that proxies `/api/*` to web. Next checks `fallback` rewrites only
  AFTER dynamic routes, so the catch-all swallows `/api/v1/...` as
  `locale="api"`, `wsId="v1"` and breaks every proxied API call. Put
  non-migrated-route redirects in the app's `proxy.ts` middleware instead.
- Use native `console.*` for server runtime logs, preserving severity
  (`console.error`, `console.warn`, etc.). Do not add `serverLogger` runtime
  imports or automatic console log-drain installation.
- Do not modify, format, stage, commit, delete, rename, or clean up files you
  did not intentionally touch.
- Do not use destructive Git or filesystem commands unless the user clearly asks
  for that operation and the scope is explicit, except for the narrowly scoped
  post-merge worktree and local task-branch cleanup mandated below.

## 3. Mandatory Actions

- Run `git status --short` before editing. If dirty or untracked paths exist,
  treat them as user-owned or other-agent-owned until proven otherwise.
- Inspect active `tmp/agent-coordination/` notes before broad or overlapping
  work. Create a coordination note for dirty worktrees, long-running work,
  overlap, handoffs, or changes to agent/tooling/deployment rules.
- For every open Tuturuuu pull request, perform review, fixes, validation, and
  merge preparation in an isolated worktree under `.worktrees/`; do not switch
  the shared main checkout onto the PR branch. Run `bun setup` immediately after
  creating the worktree. After the PR is confirmed merged into `main`, remove
  the completed worktree and delete its local task branch.
- Before staging, unstaging, committing, amending, rebasing, or user-requested
  commit-and-push work in a shared checkout, claim the Git commit window with
  `bun git-commit-window claim` or wait with `bun git-commit-window wait`.
  Claims last 5-10 minutes, default to 10 minutes, and must be released after
  the commit operation finishes or aborts.
- Use Conventional Commits for authored commits and branch names accepted by the
  repo checker (`feature/`, `feat/`, `fix/`, `bugfix/`, `hotfix/`, `release/`,
  `chore/`, `docs/`, `style/`, `refactor/`, `perf/`, `dependabot/`,
  `claude/`).
- Do not manually bump `TUTURUUU_PLATFORM_VERSION`, package versions,
  changelogs, or plugin versions for ordinary authored work. Release Please owns
  version updates. Keep release-please annotations intact, and use
  `bun git-release-please` when merging generated release-please branches.
- Add user-facing strings to both English and Vietnamese message bundles. If a
  shared UI key is added, update every app message bundle that ships that shared
  UI and run `bun i18n:sort`.
- Add new dashboard routes to the relevant `navigation.tsx` aliases, children,
  icons, and permissions.
- Migration-aware changes (the `apps/web` → `apps/backend` (Rust) + `apps/web` →
  `apps/tanstack-web` switch is in progress — do not add debt while it is
  pending): treat `apps/web`, `apps/backend`, and `apps/tanstack-web` as one
  system, not three independent apps.
  `apps/backend` is a future migration target only: it is not deployed and does
  not serve current production traffic. `apps/web` remains the live API source
  of truth until an explicitly approved cutover.
  - When you ADD or CHANGE an `apps/web` API route (any method), also keep the
    Rust port in step: if `apps/backend` already owns that path, update the Rust
    handler in the same change; if it does not yet, register/refresh the route in
    `apps/tanstack-web/migration/route-overrides.json` and run
    `bun migration:tanstack:manifest` so the route is tracked as backlog instead
    of becoming invisible debt. Never silently diverge web behavior from a route
    Rust already serves.
  - When you ADD or CHANGE a dashboard page/route, mirror the same registration
    so `apps/tanstack-web` migration tracking stays accurate, and route shared
    data access through `packages/internal-api` (which both frontends use)
    rather than app-local fetchers.
  - When porting a backend route to Rust, migrate GET first if mutations are not
    ready, return `None` (not `405`) for un-ported methods so they fall through
    to the still-live Next.js route, and verify with the runtime coverage probe
    documented in `apps/backend/AGENTS.md`. Keep behavior, status codes, and
    cache headers faithful to the legacy route. A Rust handler being marked
    migrated means source parity is implemented, not that traffic has moved.
- Keep every source file well-maintained and under a hard ceiling of 700 LOC
  whenever possible. Treat ~400 LOC (and ~200 LOC for components/widgets) as the
  point to start splitting when you create or significantly edit a file; never
  let a file you author or substantially edit cross 700 LOC without splitting it
  into focused modules. This applies to all languages, including the Rust
  backend (`apps/backend/src/*.rs` — extract submodules; move large `#[cfg(test)]`
  blocks into a sibling `mod tests;` file). Keep existing import paths stable
  with thin re-exports (or `pub use`) when callers depend on them.
- Update `apps/docs` when work changes how the team should build, run, debug,
  deploy, or operate the system. Add new docs pages to `apps/docs/docs.json`.
- For TypeScript, JavaScript, root script, or repo config changes, finish with
  `bun check` unless an unrelated pre-existing blocker prevents it. Run focused
  tests first.
- `bun check` does NOT compile Next apps or run migrations, so it cannot see
  `cacheComponents` violations, unresolved dynamic/side-effect imports, or a
  broken FK in a new migration. When you change an app's routes, pages, or
  dependencies, also run that app's real `bun run build`; when you add a
  migration, apply it locally (`bun sb:reset`/`sb:up`) before trusting it.
- For new or substantially edited TypeScript server/service orchestration,
  prefer `@tuturuuu/utils/effect` when typed expected errors, dependency
  services, retry/scheduling, or controlled concurrency make the flow safer.
- After Flutter ARB key changes, run `flutter gen-l10n` before Flutter analysis
  or tests.

## 4. Repository Map

- `apps/web`: main Next.js App Router platform app on port `7803`. Current source
  of truth; backend (API/route) logic is being migrated OUT of it into
  `apps/backend`, and pages/frontend into `apps/tanstack-web`.
- `apps/backend`: future Rust worker target (native Docker + Cloudflare Workers)
  that backend API routes are being prepared for handler-by-handler. It is not
  currently deployed or used for production traffic. See its nested `AGENTS.md`.
- `apps/tanstack-web`: TanStack Start frontend migration target that consumes the
  future Rust backend through Start server functions / `packages/internal-api`
  facades after cutover.
- `apps/contacts`: `contacts.tuturuuu.com` satellite (port `7827`) that now owns
  the entire `workspace_users` CRM surface (`/[wsId]/users/*` + `workforce`).
  `apps/web` no longer has a users section. Shared logic lives in
  `@tuturuuu/users-core` (server) and `@tuturuuu/users-ui` (client); routes it
  does not own are listed in `CONTACTS_OWNED_ROUTE_PREFIXES` (`src/proxy.ts`) and
  everything else under `/[wsId]` redirects to web.
- `apps/forms`: `forms.tuturuuu.com` satellite (port `7828`) that owns the entire
  forms product — the studio/builder, responses, analytics, and the public
  form-filling surface at `/f/<shareCode>`. It owns its own API routes under
  `/api/v1/workspaces/[wsId]/forms/*` and `/api/v1/shared/forms/*` rather than
  proxying them to web. `apps/web` no longer has any forms code and only
  redirects (`/[wsId]/forms/*`, plus a permanent 308 from the legacy
  `/shared/forms/<shareCode>` links). Forms tables live in the Postgres
  `private` schema and require the admin client.
- `apps/mobile`: Flutter mobile app.
- `apps/database`: Supabase migrations, configuration, reset scripts, and tests.
- `apps/docs`: Mintlify docs and operational runbooks.
- `apps/discord`: Python Discord utilities.
- `packages/*`: shared UI, AI, types, internal API clients, auth, payment,
  Supabase helpers, and utilities.
- `plugins/tuturuuu`: repo-local Codex plugin and skill references that carry
  detailed platform operating knowledge.

Internal packages use `workspace:*`. Default to Server Components in
`apps/web`; add `'use client'` only for state, browser APIs, or interactivity.
Import DB types from `@tuturuuu/types/db` where possible and never hand-edit
generated type files.

## 5. Canonical Workflows

### Database

1. Create migrations with `bun sb:new`.
2. Prefer additive SQL and rollout-safe runtime fallbacks.
3. Apply locally with `bun sb:up` when feasible.
4. Run `bun sb:typegen` after schema changes once the local database reflects
   the migration.
5. Use `normalizeWorkspaceId(wsId)` in API routes that accept `personal` or
   other workspace aliases.

### UI And Navigation

1. Add translations in `en.json` and `vi.json`.
2. Use `@tuturuuu/icons` and `@tuturuuu/ui/dialog`.
3. Use TanStack Query for client fetching/mutation and route shared app API
   access through `packages/internal-api/src/*`.
4. Update navigation for new dashboard routes.
5. Run `bun i18n:sort` after message edits.

### Settings

- Use `SettingsDialogShell` from
  `@tuturuuu/ui/custom/settings-dialog-shell`.
- Add tabs to the app's `SettingsDialog`; do not create separate settings pages
  unless the product already owns that route pattern.
- Extract portable settings to `packages/ui` only when they have no `@/`
  imports.

### Dependencies

- Add a dependency to `apps/web` with `cd apps/web && bun add <package>`.
- Add a dependency to `packages/ui` with `cd packages/ui && bun add <package>`.
- Never manually edit package manifests for dependency changes.

### Tuturuuu CLI

- Use the global `ttr` command for the installed CLI. Inside this monorepo,
  `bun ttr ...` runs the repo-local SDK script.
- Discover live IDs with `ttr whoami`, `ttr workspaces`, `ttr boards`,
  `ttr lists`, `ttr labels`, and `ttr tasks --json --no-update-check`.
- For task capture, use `ttr tasks create/update/done/close` as the default
  source of truth instead of local TODO files or GitHub issues unless the user
  explicitly asks for those.
- For machine-readable commands, keep stdout JSON clean and use
  `--no-update-check` where appropriate.

### Coordination

Use `tmp/agent-coordination/<YYYYMMDD-HHMMSS>-<agent-or-task>.md` for live
coordination when work may overlap or when changing coordination/plugin/tooling
rules. Include Agent, Intent, Owned paths, Observed dirty paths, Status, Needs,
Verification, Risks, and Commit window when a commit may be needed. Do not edit
another agent's note unless explicitly asked. Archive only your own completed
`done` notes under
`tmp/agent-coordination/archive/<YYYY>/` when no handoff must remain visible.
Use exact coordination statuses `working`, `blocked`, `handoff`, or `done`;
archive top-level `done` notes, and treat missing or noncanonical statuses as
active until resolved. Never stage coordination notes.

`bun git-commit-window` stores an advisory lock at
`tmp/agent-coordination/git-commit-window.lock.json`. It serializes Git index
and commit operations only; it does not grant file ownership or permission to
stage unrelated paths. Use `wait` to sleep until another agent releases the
window and then atomically claim it. Keep claims short; the tool enforces a
5-10 minute TTL so agents use the window only for focused commit work.

## 6. Pattern Catalogs

Detailed gotchas and composable patterns are intentionally outside this root
file:

- Web/API/UI patterns:
  `plugins/tuturuuu/skills/tuturuuu-platform/references/platform-patterns.md`
- Web release and badge patterns:
  `plugins/tuturuuu/skills/tuturuuu-web-release/references/web-release-checklist.md`
- Database/API/storage patterns:
  `plugins/tuturuuu/skills/tuturuuu-database/references/database-api-patterns.md`
- CI/root-script/tooling patterns:
  `plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md`
- Docker blue/green watcher patterns:
  `plugins/tuturuuu/skills/tuturuuu-ci-docs/references/blue-green-patterns.md`
- Mobile patterns:
  `plugins/tuturuuu/skills/tuturuuu-mobile-task-board/references/mobile-patterns.md`

When a durable rule belongs to one of those catalogs, update the focused skill
reference and docs. Add root `AGENTS.md` rules only for cross-cutting hard
mandates that must be seen before skill loading.

## 7. Session Retrospective

At the end of every implementation session:

1. Review mistakes, ambiguities, and blockers.
2. Put durable knowledge in the narrowest lasting home: focused skill reference,
   `apps/docs`, validator, or helper script.
3. Keep `AGENTS.md`, plugin skills, and docs aligned when a hard rule changes.
4. Record verification and risks in your coordination note, then archive your
   own completed note when appropriate.
5. Report any unrelated verification blockers without modifying unrelated files.
