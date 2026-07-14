# Tuturuuu CLI Task Workflows

## Discovery

Use the CLI as the task source of truth:

```bash
ttr whoami --no-update-check
ttr boards --no-update-check
ttr lists --no-update-check
ttr labels --no-update-check
ttr projects --no-update-check
ttr tasks --json --no-update-check
```

Inside the Tuturuuu monorepo, use `bun ttr ...` to run the local package script.
Use `ttr ...` for the globally installed CLI.

## Listing

```bash
ttr tasks
ttr tasks --compact
ttr tasks --json --no-update-check
ttr tasks --compact --json --no-update-check
ttr tasks --all
ttr tasks --done
ttr tasks --closed
ttr task-templates list
ttr task-templates list --json --no-update-check
```

`ttr tasks` orders rows by priority and then due date. Human table output should
show compact due labels such as `Today`, `Tomorrow`, or `May 10`.

## Search

Use `ttr tasks search` when the agent needs ranked matching across task name and
description text:

```bash
ttr tasks search "deadline review"
ttr tasks search "deadline review" --mode text
ttr tasks search "deadline review" --mode semantic
ttr tasks search "deadline review" --mode hybrid --limit 20 --threshold 0.25
ttr tasks search --query "deadline review" --json --no-update-check
```

Search defaults to `hybrid`, preserves API relevance order in human and compact
output, and shows score values when available. Use `--mode text` for full-text
search only when embedding credits should not be spent. Keep existing
`ttr tasks --q <query>` usage as the lightweight list text filter; do not
repurpose it as ranked search.

## Keyboard Selection

Omit IDs in a TTY to select with the keyboard:

```bash
ttr workspaces use
ttr boards use
ttr lists use
ttr tasks use
ttr tasks get
ttr tasks move
```

Interactive picker rows use one-based indexes and tier/status badges before the
name, such as `[FREE] Tuturuuu` or `[PRO] Personal`.

## Creation

Create a task with the current selected board/list, or prompt for one when a TTY
is available:

```bash
ttr tasks create "Add Tuturuuu CLI"
```

Create directly into a known task list:

```bash
ttr tasks create --list <list-id> --name "Write release notes"
```

Create with explicit board, list, and labels after discovery:

```bash
ttr boards --no-update-check
ttr lists --no-update-check
ttr labels --no-update-check
ttr tasks create "Fix calendar sync cron job" --board <board-id> --list <list-id> --labels <label-id>,<label-id>
```

Create from a workspace or local template. Explicit flags win over template
defaults:

```bash
ttr task-templates list --no-update-check
ttr tasks create --template bug-report --list <list-id> --name "Investigate checkout bug"
ttr tasks create --template .tuturuuu/task-templates/bug-report.md --priority high
```

Split a combined task by creating the replacements first, then closing the
superseded original:

```bash
ttr tasks create "Integrate the classroom demo into Tuturuuu web" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks create "Integrate the classroom demo into Tuturuuu mobile" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks close <combined-task-key>
```

## Completion And Closure

Mark completed and let Tuturuuu choose the first `done` list:

```bash
ttr tasks done <task-id>
```

Mark completed into a specific done destination:

```bash
ttr tasks done <task-id> --list <done-list-id>
```

Use a raw update payload when the agent needs to combine completion with other
field changes:

```bash
ttr tasks update <task-id> --json-payload '{"completed":true}'
```

Mark closed and let Tuturuuu choose the first `closed` list when available:

```bash
ttr tasks close <task-id>
```

Mark closed into a specific closed destination:

```bash
ttr tasks close <task-id> --list <closed-list-id>
```

Move with a picker, or move directly:

```bash
ttr tasks move
ttr tasks move <task-id> --list <list-id>
ttr tasks move <task-id> --target-board <board-id> --list <list-id>
```

## Descriptions

Use first-class description commands instead of raw JSON payloads when reading
or changing task descriptions. They update both the TipTap JSON projection and
the Yjs state used by the web editor.

```bash
ttr tasks description get <task-id>
ttr tasks description get <task-id> --format yjs-base64
ttr tasks description set <task-id> --text "Acceptance criteria"
ttr tasks description set <task-id> --file notes.md --format markdown
ttr tasks description append <task-id> --file - --format markdown
ttr tasks description edit <task-id>
ttr tasks description clear <task-id>
```

Create or update tasks with descriptions directly:

```bash
ttr tasks create "Write release notes" --description-file notes.md --description-format markdown
ttr tasks create "QA handoff" --description-file table.md --description-format markdown
ttr tasks update <task-id> --description "Clarified acceptance criteria"
```

Use local codec utilities for debugging or preparing payloads without login:

```bash
ttr tiptap parse --text "Hello" --output json
ttr tiptap parse --input notes.md --format markdown --output yjs-base64
ttr tiptap parse --text "| Field | Value |\n| --- | --- |\n| Owner | Platform |" --format markdown --output json
ttr tiptap encode --input description.json --format json --output bytes-json
ttr tiptap decode --input state.txt --format yjs-base64 --output text
```

Markdown task descriptions support GFM pipe tables. The shared codec turns those
tables into TipTap table nodes, so do not bypass the codec with plain text or raw
JSON when creating descriptions from `ttr` or local template files.

## Task Templates

Task templates are reusable single-task starters. They are distinct from board
templates and should be managed through `ttr task-templates` when a workflow
needs repeatable title, description, priority, labels, assignees, projects,
dates, estimate, or default board/list metadata.

Workspace templates live in Tuturuuu and can be shared at `workspace`
visibility or kept private to the creator:

```bash
ttr task-templates list
ttr task-templates show bug-report
ttr task-templates create "Bug report" --key bug-report --title "Investigate bug" --priority high
ttr task-templates update bug-report --visibility workspace
ttr task-templates use bug-report --list <list-id> --name "Investigate checkout bug"
ttr task-templates delete bug-report
```

Local templates live under `.tuturuuu/task-templates/*.md`. The YAML
frontmatter stores metadata such as `key`, `name`, `task_name`, `priority`,
`label_ids`, `assignee_ids`, and `project_ids`; the markdown body becomes the
task description, including GFM pipe tables.

```markdown
---
key: qa-handoff
name: QA handoff
task_name: Verify release handoff
priority: high
---

| Field | Value |
| --- | --- |
| Owner | Platform |
| Environment | Staging |
```

```bash
ttr task-templates export bug-report --file .tuturuuu/task-templates/bug-report.md
ttr task-templates import .tuturuuu/task-templates/bug-report.md
ttr tasks create --template .tuturuuu/task-templates/bug-report.md --list <list-id>
```

For agent workflows, keep stdout parseable with `--json --no-update-check`.
When a key could match both a workspace template and local markdown file, pass
the explicit file path for the local template.
