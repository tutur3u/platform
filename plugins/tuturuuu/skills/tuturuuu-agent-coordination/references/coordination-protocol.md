# Shared Worktree Coordination Protocol

This protocol keeps concurrent human and agent work from overwriting each other.
It complements `git status`; it does not replace it.

## Triage

1. Run `git status --short`.
2. If `tmp/agent-coordination/` exists, inspect active notes:

   ```bash
   rg -n "Status: (working|blocked|handoff)" tmp/agent-coordination
   ```

3. Classify the path space:
   - `clean`: no dirty paths and no active note overlap.
   - `dirty-unrelated`: dirty paths exist, but they are outside your write set.
   - `active-overlap`: an active note claims files you need.
   - `stale-unclear`: an old note is still marked active and might overlap.
4. Pick a non-overlapping write set before editing. If the task truly needs an
   overlapped path, coordinate first.

## When To Create A Note

Create a note under `tmp/agent-coordination/` before editing when any condition
applies:

- `git status --short` shows pre-existing dirty or untracked paths.
- Active notes mention the same app, package, docs area, migration family, plugin,
  or workflow.
- The task will run for more than a quick focused patch.
- The task edits broad or high-traffic surfaces such as `apps/web`, `packages/*`,
  `apps/database`, `apps/docs`, `.github`, `scripts`, or `plugins/tuturuuu`.
- The task changes coordination, commit, validation, CI, deployment, or skill
  behavior for future agents.

## Note Template

Use a sortable timestamp and short slug:
`tmp/agent-coordination/<YYYYMMDD-HHMMSS>-<task-slug>.md`.

```md
Agent: <agent name or session id>
Intent: <one-line task summary>
Owned paths:
- <path or directory>
Observed dirty paths:
- <pre-existing path you will not touch>
Status: working | blocked | handoff | done
Needs: <specific question or response requested, or None>
Verification:
- <command already run, if any>
Risks:
- <remaining risk, if any>
```

Keep claims narrow. If the task scope shrinks, update the note with the smaller
owned path set so other agents can proceed around you.

## Handling Overlap

- If another active note owns the files you need, do not overwrite or reformat
  them.
- If your work can be split, take the disjoint slice and record the boundary in
  your note.
- If you need the same files, write a response note that names the blocked paths
  and what you need. Ask the user when the choice affects product behavior or
  when ownership cannot be resolved locally.
- If a note is old but still active, treat it as potentially active until you
  have checked `git status` and read the note. Old age alone is not permission to
  take over.

## Status Transitions

- `working`: you are actively editing or validating the owned paths.
- `blocked`: you cannot proceed without a human or another agent decision.
- `handoff`: another agent can continue; include what remains and what already
  passed or failed.
- `done`: your scoped work is complete; include verification and residual risks.

Before the final response, update your own note to `done` or `handoff`. Do not
commit coordination notes.

## Commit And Verification Hygiene

- Stage explicit paths only.
- Inspect staged paths before committing.
- If checks fail on unrelated dirty files, do not fix them for convenience.
  Report the blocker and keep your diff scoped.
- When using commit hooks, keep unrelated dirty files unstaged. If a hook reads
  the whole worktree and fails outside your scope, report that as an unrelated
  blocker instead of widening the patch.
