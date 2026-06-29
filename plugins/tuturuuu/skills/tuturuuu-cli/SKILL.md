---
name: tuturuuu-cli
description: Core Tuturuuu SDK and CLI workflow guidance. Use when installing, verifying, publishing, debugging, or using the `ttr` or `tuturuuu` CLI, SDK user clients, browser login, copy-token login, workspace discovery, scoped help, version checks, or autonomous agent workflows. Use the focused task and finance CLI skills for task or finance commands.
---

# Tuturuuu CLI

## Core Workflow

Use this skill when a task involves the native Tuturuuu SDK and CLI package
published as `tuturuuu` and invoked primarily as `ttr`.

Before changing CLI code, inspect the owning surfaces:

- `packages/sdk/src/cli/*` for command parsing, login, config, rendering, and update checks.
- `packages/sdk/src/platform.ts` and `packages/sdk/src/platform-*.ts` for authenticated user-client helpers.
- `packages/internal-api/src/*` for shared route helpers used by the CLI.
- `apps/web/src/app/api/cli/auth/*` for browser login and token exchange.
- `apps/docs/reference/packages/sdk.mdx` and `packages/sdk/README.md` for durable usage documentation.
- `plugins/tuturuuu/skills/tuturuuu-cli/references/cli-workflows.md` for install, auth, and SDK client examples.

If the user asks for commits, combine this skill with `$tuturuuu-commit`.
Separate CLI behavior, docs/help text, and version or release metadata only when
they are independently revertible.

Use the focused companion skills when the task is specific:

- `$tuturuuu-cli-tasks` for task listing, task capture, task templates, task
  mutation, compact task output, task board/list/label discovery, and `ttr
  tasks` verification.
- `$tuturuuu-cli-finance` for finance CRUD, analytics reads, finance pagination,
  explicit-workspace finance diagnostics, and wrapped finance response
  normalization.

## Install Or Repair The CLI

Prefer using an existing `bun` on `PATH`. If `bun` is missing and the user asks
for autonomous installation, install Bun with the platform-native command:

- macOS/Linux: `curl -fsSL https://bun.sh/install | bash`
- Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`

Then install or update the CLI:

```bash
bun i -g tuturuuu
```

After installation, verify the command path with:

```bash
ttr help
ttr --version
```

Use `ttr upgrade` to update an existing global install. It should run
`bun i -g tuturuuu`.

Inside the Tuturuuu monorepo root, `bun ttr ...` runs the local workspace
script. Outside the repo or after global installation, use `ttr ...` directly.
Do not diagnose `bun ttr login` as a registry install problem; Bun treats that
form as a package script lookup.

## Scoped Help

The CLI should support scoped help without requiring login, reading saved config,
or checking npm for updates. Keep these forms equivalent where possible:

```bash
ttr --help
ttr upgrade --help
ttr finance --help
ttr finance wallets --help
ttr finance transactions --help
ttr tasks --help
ttr tasks create --help
ttr task-templates --help
ttr task-templates create --help
ttr task-templates import --help
ttr tasks done --help
ttr tasks close --help
ttr tasks update --help
ttr help tasks create
```

When adding commands, add help in the same patch. Global help should orient the
command map, group help should explain defaults and shared flags, and action
help should show concrete examples plus required payload flags.

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
