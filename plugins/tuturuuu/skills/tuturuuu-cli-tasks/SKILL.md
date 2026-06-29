---
name: tuturuuu-cli-tasks
description: Tuturuuu CLI task workflow guidance. Use when listing, reading, creating, templating, splitting, moving, closing, or marking Tuturuuu tasks through `ttr tasks` or `ttr task-templates`, including task board/list/label discovery, compact output, task mutation verification, and ttr-first task capture.
---

# Tuturuuu CLI Tasks

## Core Workflow

Use this skill when the user asks to add, create, template, track, split, list,
inspect, move, complete, or close Tuturuuu tasks through the native `ttr` CLI.

Inside the Tuturuuu monorepo, use the local script form:

```bash
bun ttr tasks --json --no-update-check
```

Outside the monorepo or after global installation, use `ttr ...` directly.
Use `$tuturuuu-cli` for CLI install, auth, session, version, or general SDK work.
Use `$tuturuuu-commit` when the user asks to commit task CLI changes.

Detailed examples live in
`plugins/tuturuuu/skills/tuturuuu-cli-tasks/references/task-workflows.md`.

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

Create commands should support a quoted positional name as shorthand for
`--name`, especially `ttr tasks create "Add Tuturuuu CLI"`.

For a combined task that should be split, create replacement tasks first, verify
the new task keys, then close or otherwise mark the original as superseded.

## Task Defaults

Read-oriented task-adjacent groups list by default:

- `ttr boards`
- `ttr labels`
- `ttr lists`
- `ttr projects`
- `ttr task-templates`
- `ttr tasks`

`ttr tasks` should show open tasks by default by excluding rows with
`completed_at` or `closed_at`. Keep `--all`, `--done`, `--closed`,
`--include-done`, `--include-closed`, and `--compact` intentional.

Compact task output is for agent workflows and should display only task title,
task list name, and workspace name unless the user asks for JSON. Human table
output should order by priority first, then due date, with readable due labels
such as `Today`, `Tomorrow`, or `May 10`.

## Mutations

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

## Task Templates

Use `ttr task-templates` for reusable single-task starters. They are separate
from board templates and can be workspace-stored or local markdown files under
`.tuturuuu/task-templates/*.md`.

Prefer workspace template keys for shared team workflows:

```bash
ttr task-templates list --no-update-check
ttr task-templates show <key-or-id> --no-update-check
ttr task-templates create "Bug report" --key bug-report --title "Investigate bug"
ttr task-templates use bug-report --list <list-id>
```

Use local markdown templates for repo-local or personal starters, then import
them only when the user wants a persisted workspace template:

```bash
ttr task-templates export bug-report --file .tuturuuu/task-templates/bug-report.md
ttr task-templates import .tuturuuu/task-templates/bug-report.md
ttr tasks create --template .tuturuuu/task-templates/bug-report.md --name "Investigate checkout bug"
```

Template frontmatter should stay machine-readable YAML. The markdown body is the
task description. Explicit task-create flags such as `--name`, `--list`,
`--priority`, `--labels`, `--assignees`, and `--projects` override template
defaults.

## Verification

Use `ttr tasks --json --no-update-check` for agent-readable task discovery. It
keeps stdout parseable and avoids update-check chatter while the agent decides
which tasks to read or mutate.

For CLI task code changes, run focused checks first:

```bash
bun --cwd packages/sdk test src/cli/commands.test.ts
bun --cwd packages/sdk test src/cli/task-templates.test.ts
bun --cwd packages/sdk test src/platform.test.ts
bun --cwd packages/sdk type-check
```

If task helper queries changed, also run:

```bash
bun --cwd packages/internal-api test src/tasks.test.ts
```

If task-template API helpers changed, also run:

```bash
bun --cwd packages/internal-api test src/task-templates.test.ts
```
