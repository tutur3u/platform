# Repository Workflows

Consult only the section relevant to the current task. Paths are repository-relative.

## 4. Repository Map

- `apps/web`: maintained Next.js platform on port `7803`; live route owner
  alongside the owning Next.js satellites.
- `apps/backend` and `apps/tanstack-web`: paused Rust/TanStack Start source,
  not in use. Do not run, update, or refresh them during ordinary app work.
- Docker setup is inactive and the Docker cron runner is retired. Use the local
  Mintlify CLI for docs and hosted Vercel/Cloudflare scheduler ownership; see
  `apps/docs/build/devops/active-runtime.mdx`.
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
  For MarkItDown changes, read both `/markitdown` adapters (`app.py` and
  `local_server.py`) and the download/conversion boundaries in
  `markitdown_service.py`. Follow the focused no-install Python commands in
  `apps/discord/TESTING.md`; use fixtures instead of real signed URLs or remote
  services. Preserve configured-origin validation before requests, disabled
  redirects, constant temporary suffixes, and download limits. The URL policy
  and DNS trust boundary are documented in
  `apps/docs/platform/ai/structured-data.mdx#attachment-conversion-url-policy`.
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
6. Resolve client route aliases with `resolveWorkspaceId` from
   `@tuturuuu/utils/constants` before workspace guards, component keys, query keys
   and recovery storage scope. Compare canonical root scope to `ROOT_WORKSPACE_ID`;
   `internal` and its accepted case variants must share the UUID route's original
   operation. Keep server authorization and actor lifetime checks unchanged.

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
- For security patches, capture `bun audit --json` before changing dependencies,
  then update direct dependencies from their owning workspace. Keep Vite+ and
  its `vite` alias aligned; verify the upstream release's bundled Vite version.
- Root `overrides` cover transitive-only fixes. Use `bun pm pkg set --json`
  with the complete merged overrides object, preserving existing entries.
  Scope version selectors to vulnerable releases when fixed copies already
  exist, and pin the minimum safe version on each affected major. A cross-major
  override needs consumer tests, including imports of dependency internals.
- Re-audit after each resolution: the first fixed version can have a newer
  advisory. Verify `bun install --frozen-lockfile` and preserve unsolved findings
  with registry/advisory evidence; never suppress them to claim a clean audit.
- Audit Python locks, Flutter's locked Pub packages, and external Actions refs
  separately. Compare advisories to installed versions; a package having a
  historical advisory does not establish that the current ref is affected.

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

## Node fixture transform configuration

For the employee Web session support suite, keep a matching
`apps/web/e2e/fixtures/tsconfig.json` that inherits Web settings and includes the
fixture TypeScript files. Vite/Oxc skips a parent config whose include paths do
not match, then can traverse unrelated root project references. A missing preset
there can fail collection before any support test runs. Verify this boundary
with the support suite's disposable-tree transform regression; do not add import
aliases, unrelated dependencies, or weaken runtime assertions to mask it.
Support-test success remains separate from hosted session qualification.


For hosted employee Web-session qualification failures, inspect the strict receipt's
first `failure` separately from `cleanup.server` and `cleanup.proxy`. A historical
cleanup-only phase can mask an earlier runtime error; empty cases do not establish
an auth defect. Preserve the first failure, attempt both cleanup steps, and retain
only fixed phases/categories, bounded process exit/signal/deadline fields. Run the
finite Web-session support suite and receipt/process tests before parent-owned
exact-source hosted qualification; never infer full runtime proof from these tests.

For build exit failures, retain only the existing bounded compiler projection:
fixed categories/codes, exact tracked source paths and truncation status. Never
publish raw child output, even on failure. Test synthetic secret-bearing output,
stream bounds and the actual child exit before accepting instrumentation. Test
proxy close separately in the actual Bun runtime; if it does not reproduce,
retain its fixed cleanup error category without inventing a repair. Match source
and control parser revisions for the next parent-owned hosted qualification.

The employee fault proxy must call `server.close(callback)` before
`server.closeAllConnections()`. Exact Bun 1.4.1 finite reproduction shows the
reverse order stops listening before close registration and yields
ERR_SERVER_NOT_RUNNING; do not ignore that error. Verify the pinned actual Bun
control's close/port-refusal/repeated-close rejection, and keep real hosted
Web-build/session qualification separate from this synthetic lifecycle proof.

Employee Web-session qualification prepares emitted workspace dependencies via
root `turbo:local run build --filter=@tuturuuu/web^... --concurrency=1` before the
existing direct real Web build, sharing one 18-minute deadline. Use actual export
maps plus clean pinned-install Node/Bun resolver probes to diagnose missing emitted
targets; a Bun source-condition resolution is not Node/Next artifact proof. Keep
injected fixture configuration on the direct compiler and require new hosted
acceptance. Do not generate fake dist modules or run either build locally.

Captured employee build groups are created by the existing outer session owner,
not detached inside the fixture. Private IPC requests fail closed without that
owner. Leader exit, deadline, fixture hard kill and outer timeout must drain all
owned groups, including TERM-resistant inherited-pipe descendants, before cleanup
qualifies. Keep actual resolved runtimes in IPC tests; wrapper commands can drop
extra descriptors. Retain fixed bounded compiler diagnostics and first exit status.

For employee Web startup failures, inspect the strict startup diagnostic before
changing routes or Auth. Readiness remains exactly HTTP 401; retain only fixed
outcome/observation, bounded status and attempts, child exit/signal and timeout.
Keep response bodies, headers, URLs and startup stdout/stderr out of receipts.
Startup capture retains only two fixed 16-KiB prefixes and projects fixed categories
plus truncation; raw output never enters receipts. Bound capture-reader closure
from direct-child exit, so descendants retaining writers cannot block the existing
server/proxy cleanup. Preserve the outer process-group owner and TERM/KILL fences.
Launch the resolved Next CLI from the Web app cwd, without a second `apps/web`
directory argument. A source-root launch can make Next's TypeScript config loader
select imports outside the installed source checkout; use the disposable actual
config-loader regression before changing shared dependencies. Category-only hosted
receipts do not identify the missing module. Use finite loopback/pinned-runtime
controls for classification; only the matching hosted source/control run can
establish actual startup and Web24 acceptance.

For employee inactive-actor failures, trace the proxy assurance layer before the
route policy: a fresh provider ban behind a signed satellite cookie returns
`401 / UNAUTHENTICATED / no-store` before the route's `403 / forbidden` check.
Keep exact status/code assertions for both the ban and rejected-provider-bearer
cases, and assert no provider update by either denied request. The focused
required-MFA runtime tests inject provider responses; they do not prove hosted
ban persistence or session invalidation after sign-out. Preserve the full case
inventory and use the matching hosted qualification for those effects.

For a failed self-action boundary, reconstruct the exact assertion ledger first:
the request's no-store assertion precedes its status/code assertion. Preserve the
exact409/employee_self_action contract; use the case-bound fixed diagnostic when
the actual response is absent. Strict receipts must bind metadata to the exact
incomplete case prefix, discard private extras and retain the size bound. A local
restoration-handler regression proves self rejection before provider/SQL effects,
not which earlier layer produced an unknown hosted response.

Use the fixture's localhost HTTP origin even when the Next listener binds IPv4
loopback. Next normalizes 127.0.0.1 request URLs to localhost; an IP Origin then
fails the exact origin check before self-action/CREATE. Reproduce with actual
NextRequest plus the handler, and verify finite localhost-to-IPv4 transport.
Audit creator permission bypass before changing default grants: restored MEMBER
membership can authorize the fixture creator without those grants. Keep exact
self409/CREATE201 expectations and require hosted acceptance after source repair.

Employee schema receipt/process gates execute in the uninstalled control root,
while dependency-bearing Web support tests execute in installed source. Process
controls must import the canonical dependency-free owner directly, use byte-checked
isolated copies and Bun --no-install, and retain actual marker/descendant cleanup
assertions. Diagnose root/import boundaries before attributing a control timeout
to IPC or Web startup; a missing later artifact is secondary when the gate failed.
