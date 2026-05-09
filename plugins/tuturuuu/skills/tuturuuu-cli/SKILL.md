---
name: tuturuuu-cli
description: Tuturuuu SDK and CLI workflow guidance. Use when installing, verifying, publishing, debugging, or using the `ttr` or `tuturuuu` CLI, SDK clients, browser login, copy-token login, workspace discovery, task listing, finance CRUD, task mutation, compact output, or autonomous agent workflows.
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
- `plugins/tuturuuu/skills/tuturuuu-cli/references/cli-workflows.md` for detailed agent-facing examples.

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

## Task Capture Requests

When a user asks to add, create, track, or split a Tuturuuu task, prioritize the
`ttr` CLI immediately. Do not substitute markdown TODOs, local notes, or GitHub
issues unless the user explicitly asks for those artifacts.

Discover current destinations before creating tasks:

```bash
ttr whoami --no-update-check
ttr boards --no-update-check
ttr lists --no-update-check
ttr labels --no-update-check
```

Inside the Tuturuuu monorepo, use the local script form:

```bash
bun ttr tasks create "Fix calendar sync cron job" --board <board-id> --list <list-id> --labels <label-id>,<label-id> --no-update-check
```

For a combined task that should be split, create each replacement task with
relevant labels first, verify the new task keys, then close or otherwise mark
the original task as superseded:

```bash
ttr tasks create "Integrate Valsea demo into Tuturuuu web app" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks create "Integrate Valsea demo into Tuturuuu mobile app" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks close <combined-task-key>
```

## Task Defaults

Read-oriented groups list by default:

- `ttr workspaces`
- `ttr boards`
- `ttr labels`
- `ttr projects`
- `ttr tasks`

`ttr tasks` should show open tasks by default by excluding rows with
`completed_at` or `closed_at`. Keep these filters available:

- `--all`
- `--done`
- `--closed`
- `--include-done`
- `--include-closed`
- `--compact`

Compact task output is for agent workflows and should display only task title,
task list name, and workspace name unless the user asks for JSON.

Task list output should be ordered by priority first, then due date. Human table
output should format due dates into short readable labels such as `Today`,
`Tomorrow`, or `May 10`.

Create commands should support a quoted positional name as a shorthand for
`--name`, especially `ttr tasks create "Add Tuturuuu CLI"`.

When marking a task completed from the CLI, include a `completed_at` timestamp.
That lets Tuturuuu move the task to the first `done` list by default. Preserve
an explicit done destination when the user provides `--list <id>` or `list_id`
inside `--json-payload`.

Prefer quick shortcuts for common status changes:

```bash
ttr tasks done <task-id>
ttr tasks done <task-id> --list <done-list-id>
ttr tasks close <task-id>
ttr tasks close <task-id> --list <closed-list-id>
```

`ttr tasks done` should set `completed: true`, stamp `completed_at`, and use the
first `done` list on the task board unless an explicit destination is provided.
`ttr tasks close` should stamp `closed_at`, clear completion, and use the first
`closed` list on the task board when available.

Use `ttr tasks --json --no-update-check` for agent-readable task discovery. It
keeps stdout parseable and avoids update-check chatter while the agent decides
which tasks to read or mutate.

## Finance CRUD

Finance commands belong under `ttr finance` and should use the SDK user client
surface instead of duplicating route logic in command handlers. Keep CLI parsing,
payload construction, rendering, and authenticated request helpers separated
when the command group grows.

Support full CRUD for finance resources:

- `ttr finance wallets list|get|create|update|delete`
- `ttr finance transactions list|get|create|update|delete`
- `ttr finance categories list|get|create|update|delete`
- `ttr finance budgets list|status|create|update|delete`
- `ttr finance recurring list|upcoming|create|update|delete`

Keep analytics/read helpers alongside transactions when backed by finance APIs:

- `ttr finance transactions export`
- `ttr finance transactions stats`
- `ttr finance transactions category-breakdown`
- `ttr finance transactions spending-trends`

For multi-value finance query params, prefer explicit repeated query params over
comma-joined values when the backing route expects arrays.

Finance list output should be paginated consistently. Prefer `--page` and
`--page-size` for humans, keep `--limit` and `--offset` aliases for scripts, and
render the same `Page X/Y | N total` footer used by task lists whenever the
response includes a count.

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

If finance helper queries changed, run the focused SDK command and platform
tests. Add or run narrower internal-api finance tests when they exist.

If browser login pages changed, also run the focused web auth test:

```bash
bun --cwd apps/web test src/app/api/cli/auth/start/route.test.ts
```

Finish TypeScript or package changes with `bun ff` and `bun check`.
