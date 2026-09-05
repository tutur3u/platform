# AGENTS.md - Operating Manual For Autonomous AI Assistants

## 1. Authority

This file contains cross-cutting repository constraints. Task-specific procedures
live in `plugins/tuturuuu/skills/*/references/` and `apps/docs`.

Read the root and nearest applicable `AGENTS.md`. Load a focused skill only when
its capability helps the current task; read linked references by topic rather than
loading a stack of checklists before every edit. Repository rules supplement the
user's request and higher-priority runtime instructions.

Use `plugins/tuturuuu/skills/` for Tuturuuu-specific workflows. In particular:
`$tuturuuu-platform` owns web/shared UI, `$tuturuuu-database` owns schema/RLS,
`$tuturuuu-agent-coordination` owns shared-worktree safety, and
`$tuturuuu-pr-merge-sync` owns authorized integration and production sync.

Continue authorized work through implementation, relevant verification, fixes,
and any requested commit or delivery. Do not pause for review after a first draft
unless review was requested or a concrete decision, permission, or access is missing.
A skill does not authorize unrelated external actions or expand release scope.

## 2. Hard Prohibitions

- Start long-lived development servers only when requested or needed for an
  explicitly requested runtime verification. Finite local setup, tests, and builds
  needed to validate the authorized change may run without repeated confirmation.
  This does not authorize deployments or production database writes.
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
- Split reviewable dependent work into stacked PRs; keep independent changes on
  separate branches. Merge stacks bottom-up. For base-chained stacks, merge parents
  with `--merge` so ancestry is retained, verify child retargeting, and rerun gates.
  Use `$tuturuuu-pr-merge-sync` for the exact stack and quiet-window procedure.
- When the user authorizes ongoing integration, periodically checkpoint verified
  work instead of leaving it indefinitely only in retained worktrees: create
  scoped commits, integrate them into `main`, wait for every workflow on the
  exact main SHA to finish green, run `bun git-sync`, and verify production
  follow-through. Only then remove the completed worktree and delete its local
  task branch. Never remove dirty, blocked, unmerged, user-owned, or
  other-agent-owned worktrees or branches.
- Keep Rust build storage bounded with `bun rust-cache report` and the
  repository-owned `prune`/`auto` commands. Inspect the owning worktree first,
  use an explicit size/age bound, and prune only rebuildable
  `apps/backend/target` artifacts; never delete source or an unmerged worktree
  merely to reclaim Rust cache space.
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
  - Web API routes you add or substantially rework must be FIRST-CLASS route
    handlers under `apps/web/src/app/api/**`, never new or reworked
    implementations inside `apps/web/src/legacy-api-routes/**` (that tree is being
    drained; only untouched routes stay behind its generated wrappers). When you
    move a route out, `git mv` its colocated test too, delete the legacy file so
    `bun web:api-routes:check` stops generating a wrapper for it, update the
    matching key in `apps/tanstack-web/migration/route-overrides.json` (the
    override id embeds `sourceFile`), and re-run
    `bun migration:tanstack:manifest`.
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
- Keep every new authored source file at or below the hard 700-LOC ceiling.
  Already-oversized authored files are grandfathered only while they do not grow
  and should shrink when substantially edited. Tests and migrations are authored
  source; generated and vendored files are excluded from this gate. Treat ~400
  LOC (and ~200 LOC for components/widgets) as review guidance to start splitting
  into focused modules. This applies to all languages, including the Rust backend
  (`apps/backend/src/*.rs` — extract submodules; move large `#[cfg(test)]` blocks
  into a sibling `mod tests;` file). Keep existing import paths stable with thin
  re-exports (or `pub use`) when callers depend on them.
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

## 4. Task-Specific Workflows

Consult `plugins/tuturuuu/skills/tuturuuu-platform/references/repository-workflows.md`
for route ownership, settings shells, dependency commands, task capture, or
coordination metadata. Keep these operational facts out of unrelated task context.

## 5. Pattern Catalogs

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

## 6. Session Retrospective

When implementation reveals a reusable failure or a changed operating rule:

1. Identify the concrete failure or decision that future work needs to preserve.
2. Put durable knowledge in the narrowest lasting home: focused skill reference,
   `apps/docs`, validator, or helper script.
3. Keep `AGENTS.md`, plugin skills, and docs aligned when a hard rule changes.
4. Record verification and risks in your coordination note, then archive your
   own completed note when appropriate.
5. Report unrelated verification blockers without modifying unrelated files.

Do not add a new rule or test merely to record that a session occurred. Once
required checks pass, repeat or broaden them only for new changes, failures, or
unresolved risks. Report any missing authenticated or production evidence plainly.
