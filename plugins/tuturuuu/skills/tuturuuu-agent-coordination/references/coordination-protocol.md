# Shared Worktree Coordination Protocol

This protocol keeps concurrent human and agent work from overwriting each other.
It complements `git status`; it does not replace it.

## Triage

1. Run `git status --short`.
2. If `tmp/agent-coordination/` exists, inspect top-level active notes:

   ```bash
   rg -n "^Status: (working|blocked|handoff)" tmp/agent-coordination --glob "*.md" --glob "!archive/**"
   ```

   Do not scan the archive first. Archived notes are for targeted context, not
   live ownership.
3. If the archive exists, search archived context only when the current task
   references previous work, an active note points there, or a shared
   workflow/deployment decision needs history:

   ```bash
   rg -n "<path|feature|workflow>" tmp/agent-coordination/archive --glob "*.md"
   ```

4. Classify the path space:
   - `clean`: no dirty paths and no active note overlap.
   - `dirty-unrelated`: dirty paths exist, but they are outside your write set.
   - `active-overlap`: an active note claims files you need.
   - `stale-unclear`: an old note is still marked active and might overlap.
   - `archived-context`: only archived notes match; use them as historical
     guidance, not as a blocking ownership claim.
5. Pick a non-overlapping write set before editing. If the task truly needs an
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

## Archived Coordination Notes

Keep the top-level `tmp/agent-coordination/` directory small enough for fast
active scans. Move completed notes that no longer need to be prominent into:

```text
tmp/agent-coordination/archive/<YYYY>/<original-note-name>.md
```

Rules:

- Archive only notes marked `done`.
- Do not archive `working`, `blocked`, or `handoff` notes.
- Archive only your own current-session note unless the user explicitly asks for
  broader cleanup.
- Preserve the original filename so the created timestamp remains searchable.
- Do not use archived notes as locks. They capture context, decisions,
  verification, and residual risks for future agents.

When archiving your own completed note, first update the note in place with
`Status: done`, verification, and risks. Then create the year folder and move
the note. Leave active handoffs in the top-level directory until the next agent
takes over or a human asks for cleanup.

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
- `done`: your scoped work is complete; include verification and residual risks,
  then archive the note if no active handoff needs top-level visibility.

Before the final response, update your own note to `done` or `handoff`. Do not
commit coordination notes or archived coordination notes.

## Commit And Verification Hygiene

- Stage explicit paths only.
- Inspect staged paths before committing.
- If checks fail on unrelated dirty files, do not fix them for convenience.
  Report the blocker and keep your diff scoped.
- When using commit hooks, keep unrelated dirty files unstaged. If a hook reads
  the whole worktree and fails outside your scope, report that as an unrelated
  blocker instead of widening the patch.
- Never stage `tmp/agent-coordination/` or its `archive/` subtree.
