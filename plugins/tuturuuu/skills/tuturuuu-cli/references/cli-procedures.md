# Cli Procedures

## Login UX

Use `ttr login` for browser login. It should:

- open a browser to the web auth start route
- create a dedicated Supabase session labeled `Tuturuuu CLI`
- show account email in the terminal and browser confirmation when available
- store config in the OS app config directory, or `TUTURUUU_CONFIG` when set
- select `personal` as the default workspace after login and whenever no
  workspace has been selected

Use `ttr login --copy` for headless environments. The web copy-token page should
render a browser-friendly token page, while JSON clients may request the token
with `Accept: application/json`.

## Keyboard Selection

The CLI should support keyboard selection for human terminal workflows. Omit an
id from `use`, `get`, `update`, `delete`, or `move` commands to choose with
up/down or `j`/`k`, then space/enter. Escape or `q` cancels.

Picker rows should show one-based indexes and colored badges before names, for
example `[FREE] Tuturuuu` or `[PRO] Personal`, with lower-priority identifiers
kept as muted metadata.

Keep selection disabled for `--json` and non-TTY sessions so agent scripts get a
clear error instead of mixed prompt output.

Persist selected workspace, board, list, task, label, and project IDs in the CLI
config so repeated commands can use the current context.

## SDK Client Surfaces

The CLI should call SDK user-client surfaces in `packages/sdk/src/platform.ts`
and adjacent `platform-*.ts` modules. Keep command handlers focused on parsing,
payload construction, rendering, and config/session concerns. Put authenticated
API details in SDK client helpers or `packages/internal-api/src/*` helpers.

When a new command group becomes substantial, split focused modules under
`packages/sdk/src/cli/` before the command file grows too large. Keep public
exports in `packages/sdk/src/index.ts` aligned with new SDK clients and payload
types.

## Verification

For native graph projection checks, use the focused
`src/operational-graph/projection.test.ts` and `reader.test.ts` suites. The reader
validates its request before opening or reading SQLite and forwards only parsed
fields; caller extras must never replace the authoritative snapshot. Use disposable
synthetic fixtures. For Bun 1.4.1 concurrency fixtures, populate WAL through the
fixture writer before opening a read-only connection: that runtime cannot read a
freshly switched WAL database without sidecars. Do not make the reader repair it
through writes. See `apps/docs/reference/packages/cli-operational-state.mdx`.

Native graph commands use the existing store writer transaction and original
request/event receipt replay. Keep graph disposition separate from delivery
verification, retain complete canonical members, and reject canonical dependency
collapse instead of dropping an edge. Reopen/unmerge must preserve later fields
and historical evidence; an unmerge requires its current merge-operation identity.
Run `src/operational-graph/store.test.ts` and `src/cli/operational-graph.test.ts`
with the foundational receipt/state tests before freezing a graph change.

For CLI changes, run focused checks first:

```bash
bun --cwd packages/sdk test src/cli/commands.test.ts
bun --cwd packages/sdk test src/platform.test.ts
bun --cwd packages/sdk test src/cli/auth.test.ts src/cli/browser.test.ts src/cli/package.test.ts
bun --cwd packages/sdk type-check
```

If task helper queries changed, also run:

```bash
bun --cwd packages/internal-api test src/tasks.test.ts
```

If task-template commands changed, also run:

```bash
bun --cwd packages/sdk test src/cli/task-templates.test.ts src/cli/commands.test.ts
bun --cwd packages/internal-api test src/task-templates.test.ts
```

If finance helper queries changed, run the focused SDK command and platform
tests. Add or run narrower internal-api finance tests when they exist.

If browser login pages changed, also run the focused web auth test:

```bash
bun --cwd apps/web test src/app/api/cli/auth/start/route.test.ts
```

For SDK packaging, run `bun --cwd packages/sdk test:packaging`. The build stages
only the explicit portable source closure from `internal-api` and `utils`, then
compiles local imports for both JavaScript and declarations. Keep their broad
packages in development dependencies; add actual portable external libraries to
SDK dependencies with the package manager. Review new closure entries before
extending `packages/sdk/scripts/portable-build.cjs` allowlists. Require the
exact-commit SDK package qualification workflow's compile, isolated public install,
and compiled CLI probes. See `packages/sdk/PUBLISHING.md`.

Run focused non-build tests locally and require applicable exact-commit CI test,
type-check, lint, and build results. Do not run local `bun validate` or builds.

For SDK package process-drain failures on macOS, inspect the first signal-zero probe after `SIGKILL`. An exiting group can briefly return `EPERM` before disappearing. Continue bounded polling inside the existing deadline; only `ESRCH` establishes disappearance. Do not suppress persistent permission failures or weaken descendant assertions. Use `scripts/ci/sdk-package-process.test.js` for deterministic transient/persistent probe controls, alongside `qualify-sdk-package.test.js` for real descendants.
