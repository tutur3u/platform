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
```

`ttr tasks` orders rows by priority and then due date. Human table output should
show compact due labels such as `Today`, `Tomorrow`, or `May 10`.

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

Split a combined task by creating the replacements first, then closing the
superseded original:

```bash
ttr tasks create "Integrate Valsea demo into Tuturuuu web app" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks create "Integrate Valsea demo into Tuturuuu mobile app" --board <board-id> --list <list-id> --labels <label-ids>
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
