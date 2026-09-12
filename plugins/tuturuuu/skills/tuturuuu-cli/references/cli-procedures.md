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

Finish TypeScript or package changes with `bun ff` and `bun check`.
