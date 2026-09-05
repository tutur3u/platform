# Repository Workflows

Consult only the section relevant to the current task. Paths are repository-relative.

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

Run `bun coordination:audit` when note ownership is ambiguous. The read-only
default reports legacy lifecycle debt and exits zero; it does not grant path
ownership. `bun coordination:audit --strict` exits nonzero when diagnostics are
present and is intended only for clean fixtures or an owner-approved clean
environment. Missing or noncanonical notes remain active under this policy, and
only the note's owner or an explicitly authorized operator may fix or archive
them.

`bun git-commit-window` stores an advisory lock at
`tmp/agent-coordination/git-commit-window.lock.json`. It serializes Git index
and commit operations only; it does not grant file ownership or permission to
stage unrelated paths. Use `wait` to sleep until another agent releases the
window and then atomically claim it. Keep claims short; the tool enforces a
5-10 minute TTL so agents use the window only for focused commit work.
