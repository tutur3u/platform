---
name: tuturuuu-agent-coordination
description: Tuturuuu shared worktree agent coordination guidance. Use when Codex or another assistant works in a dirty or shared Tuturuuu checkout, needs to choose a non-overlapping write set, create or update tmp/agent-coordination notes, handle overlapping ownership claims, hand off work, or commit safely without touching unrelated files.
---

# Tuturuuu Agent Coordination

## Core Workflow

Use this skill whenever shared-worktree safety affects the task: dirty paths are
present, another agent may be active, the change is broad or long-running, or a
commit/check could be polluted by files outside the current scope.

For non-trivial overlap, handoff, or stale-note cases, read
`references/coordination-protocol.md` before editing.

## Coordination Posture

- Run `git status --short` before choosing a write set.
- If `tmp/agent-coordination/` exists, inspect active notes before editing.
  Treat `working`, `blocked`, and `handoff` notes as active coordination signals;
  treat `done` notes as historical context.
- Choose the smallest practical owned path set. Prefer files and focused
  directories over broad app or repo claims.
- Create a note before editing when the worktree is dirty, active notes touch a
  nearby area, the task is long-running, or the requested change modifies
  coordination rules, plugin skills, docs, scripts, migrations, or broad app
  surfaces.
- Record dirty/untracked paths you will not touch. Do not format, stage, rename,
  delete, or "clean up" those paths.

## Conflict Behavior

- If an active note claims the same files, do not race it. Choose a disjoint
  slice, write a response note, or ask the user to arbitrate.
- Do not edit another agent's note unless the user explicitly asks. Add your own
  note or response note instead.
- Stale active notes are still ownership signals. Read them, check current
  `git status`, then avoid the overlap or ask before taking over.
- Coordination notes are advisory, not permission to ignore the actual worktree.

## Completion

- Update your note to `done`, `handoff`, or `blocked` before the final response.
- Include verification already run and any remaining risks in the note.
- Stage explicit paths only when committing. Never stage `tmp/agent-coordination/`
  notes.
