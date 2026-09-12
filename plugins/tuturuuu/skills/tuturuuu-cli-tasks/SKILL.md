---
name: tuturuuu-cli-tasks
description: "Capture, organize, and verify Tuturuuu tasks and templates through ttr."
---

# Tuturuuu CLI Tasks

Use `ttr` for requested Tuturuuu task capture unless the user chooses another
tracker. In the monorepo use `bun ttr`; otherwise use installed `ttr`.
Discover the current workspace, board, list, and labels before a mutation, and
verify the resulting task keys/state afterward. Do not create tasks merely
because implementation work could be tracked.

- Capture, split, complete, or close tasks: read Task Capture Requests and
  Mutations in `references/task-procedures.md`.
- Reusable starters or import/export: read Task Templates in that reference.
- CLI implementation: read Task Defaults and Verification there; run only tests
  relevant to changed code, then repository-required checks.
- Command examples and destination discovery: `references/task-workflows.md`.

Prefer `ttr tasks --json --no-update-check` for machine-readable discovery.
Keep reads scoped; open tasks are the default. Create and verify replacements
before closing a combined task. Preserve explicit destinations and template
flag overrides. Workspace template import is a persisted mutation and needs to
be part of the request. Use `$tuturuuu-cli` only for install/auth or shared CLI work.
