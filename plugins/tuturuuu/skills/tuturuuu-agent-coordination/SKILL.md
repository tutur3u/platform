---
name: tuturuuu-agent-coordination
description: Use when Codex or another assistant works in a dirty or shared Tuturuuu checkout, encounters active or archived coordination notes, needs ownership context, has overlapping paths, is handing off work, must archive completed coordination notes, or must coordinate staged paths and commit windows.
---

# Tuturuuu Agent Coordination

## Core Workflow

Use this skill whenever shared-worktree safety affects the task: dirty paths are
present, another agent may be active, the change is broad or long-running, or a
commit/check could be polluted by files outside the current scope. Use it with
`$tuturuuu-commit` when a commit request needs exclusive access to the Git
index.

For non-trivial overlap, handoff, archived-context, or stale-note cases, read
`references/coordination-protocol.md` before editing.

## Coordination Posture

- Run `git status --short` before choosing a write set.
- If `tmp/agent-coordination/` exists, inspect top-level active notes before
  editing. Treat `working`, `blocked`, and `handoff` notes as active
  coordination signals.
- Treat `tmp/agent-coordination/archive/` as historical context. Search it only
  with targeted keywords when a task mentions prior work, an active note points
  to archived context, or you need deployment/workflow history. Archived notes
  do not block a write set by themselves.
- Choose the smallest practical owned path set. Prefer files and focused
  directories over broad app or repo claims.
- Create a note before editing when the worktree is dirty, active notes touch a
  nearby area, the task is long-running, or the requested change modifies
  coordination rules, plugin skills, docs, scripts, migrations, or broad app
  surfaces.
- Add `Commit window: not needed | claimed | waiting | blocked | released` to
  your note when a commit may be needed. Do not record the lock token in the
  note.
- Record dirty/untracked paths you will not touch. Do not format, stage, rename,
  delete, or "clean up" those paths.

## Conflict Behavior

- If an active note claims the same files, do not race it. Choose a disjoint
  slice, write a response note, or ask the user to arbitrate.
- Do not edit another agent's note unless the user explicitly asks. Add your own
  note or response note instead.
- Stale active notes are still ownership signals. Read them, check current
  `git status`, then avoid the overlap or ask before taking over.
- Archived notes are memory, not locks. Use them to learn previous boundaries,
  verification, and risks; do not treat them as permission to overwrite current
  dirty files or active claims.
- Coordination notes are advisory, not permission to ignore the actual worktree.

## Commit Window

- Use `bun git-commit-window claim --owner "<agent/task>" --scope "<commit scope>"`
  immediately before staging, unstaging, committing, amending, rebasing, or
  user-requested commit-and-push work.
- If another active lock exists and you should wait, use
  `bun git-commit-window wait --owner "<agent/task>" --scope "<commit scope>"`.
  The command sleeps until the current lock is released or expires, then claims
  the window before notifying you.
- Commit-window claims are intentionally short: default 10 minutes, accepted
  range 5-10 minutes. Claim only when ready to stage or commit, and release as
  soon as the operation finishes or aborts.
- Use `bun git-commit-window status` to inspect the current lock, and
  `bun git-commit-window release --token <token>` when the commit operation
  completes or aborts.
- The commit-window lock serializes Git index and commit operations only. It
  does not grant ownership of files, permission to stage unrelated paths, or
  permission to edit another agent's note.
- If files are already staged, `claim` and `wait` require `--allow-staged`.
  Inspect the staged scope first and preserve other agents' staged work.

## Archiving

- Treat archiving your own completed current-session note as part of finishing,
  not optional cleanup.
- Keep active coordination notes as direct files under `tmp/agent-coordination/`.
- Archive completed notes under
  `tmp/agent-coordination/archive/<YYYY>/<original-note-name>.md` after the note
  is marked `done` and no longer needs to be prominent for a handoff.
- Do not archive `working`, `blocked`, or `handoff` notes.
- Archive only your own current-session note unless the user explicitly asks for
  coordination cleanup. Housekeeping should never move another agent's active
  signal out of the top-level scan path.

## Completion

- Update your note to `done`, `handoff`, or `blocked` before the final response.
- Include verification already run and any remaining risks in the note.
- If your note is `done` and no active handoff needs top-level visibility,
  archive it before the final response.
- Stage explicit paths only when committing. Never stage `tmp/agent-coordination/`
  notes.
