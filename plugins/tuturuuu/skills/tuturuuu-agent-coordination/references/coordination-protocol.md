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
5. If a commit may be needed, inspect the commit window:

   ```bash
   bun git-commit-window status
   ```

6. Pick a non-overlapping write set before editing. If the task truly needs an
   overlapped path, coordinate first.

## Coordinator And Subagent Lanes

Use subagents to increase throughput only after the coordinator has split the
work into lanes that can move independently. A good lane has a named owner, a
small owned path set, explicit excluded paths, expected validation commands, and
a clear handoff shape. Do not delegate two workers to the same unresolved files
unless one is read-only or the second worker is explicitly continuing a
completed handoff.

Before spawning workers, the coordinator should create or update a parent note
that lists each lane:

```md
Delegated lanes:
- backend-aurora-health: apps/backend/src/aurora.rs, apps/backend/src/lib.rs
- tanstack-drive-redirect: apps/tanstack-web/src/routes/$locale/$wsId/drive.tsx,
  apps/tanstack-web/src/lib/platform/redirects.ts
- migration-audit: read-only route manifest/docs audit
Coordinator-owned paths:
- apps/tanstack-web/src/routeTree.gen.ts
- apps/tanstack-web/migration/route-manifest.json
```

Worker prompts should say that the worker is not alone in the codebase, must run
`git status --short`, must create its own coordination note before editing, must
not revert other changes, and must not stage or commit unless the lane explicitly
owns a commit. Include exact owned paths and forbidden paths in the prompt.

Workers should hand off with:

- changed files
- validation commands and pass/fail results
- generated files they intentionally left for the coordinator
- unrelated failures that blocked broader validation
- known parity gaps or follow-up risks
- confirmation that nothing was staged or committed

The coordinator reviews worker diffs before staging. If a worker's handoff
requires generated artifacts, the coordinator either owns that regeneration or
spawns a dedicated generator lane after all inputs are stable.

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
- The task may stage, unstage, commit, amend, rebase, or push commits in a
  shared checkout.

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
Delegated lanes:
- <optional coordinator-owned lane name and worker-owned paths>
Coordinator-owned paths:
- <optional generated/shared integration path>
Status: working | blocked | handoff | done
Needs: <specific question or response requested, or None>
Commit window: not needed | claimed | waiting | blocked | released
Verification:
- <command already run, if any>
Risks:
- <remaining risk, if any>
```

Keep claims narrow. If the task scope shrinks, update the note with the smaller
owned path set so other agents can proceed around you.

Do not record `bun git-commit-window` tokens in coordination notes. Tokens are
printed in the terminal for the agent that claimed the window and should be used
only to check or release that lock.

When acting as a coordinator, add `Delegated lanes` and
`Coordinator-owned paths` only when they clarify the split. Do not use the
parent note as a blanket claim over all child paths; each worker still needs a
focused owned path set.

## Generated And Integration Files

Generated files need explicit ownership because they often combine many workers'
inputs. Examples include:

- `apps/tanstack-web/src/routeTree.gen.ts`
- `apps/tanstack-web/migration/route-manifest.json`
- `apps/tanstack-web/migration/route-overrides.json` when centrally regenerated
- migration progress/docs tables
- `apps/backend/api/openapi.yaml`
- `apps/docs/docs.json`
- sorted translation bundles
- Supabase generated DB types

Default to coordinator-owned regeneration after all relevant worker patches are
reviewed. A worker may edit generated artifacts only when its lane explicitly
owns the source input and the generated output, and when no other active lane is
changing another input to the same artifact.

Route workers should usually implement route/component files and leave
`Needs: Coordinator regenerate route tree` in their note or final handoff.
The coordinator should run canonical commands such as
`bun migration:tanstack:routes`, `bun migration:tanstack:manifest`, and
`bun migration:tanstack:check` after the route/source inputs are stable.

If a validation command regenerates an out-of-scope artifact, the worker should
report it and either revert only that generated diff or leave it unstaged for
the coordinator, depending on the lane prompt. Never silently commit generated
drift from another lane.

## Archived Coordination Notes

Keep the top-level `tmp/agent-coordination/` directory small enough for fast
active scans. Archiving your own completed current-session note is part of
finishing the task, not optional cleanup. Move completed notes that no longer
need to be prominent into:

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
- Existing staged files are owned by the staging agent or coordinator until
  explicitly reassigned. Workers may edit disjoint unstaged files, but must not
  stage, unstage, amend, or commit while another staged set exists.
- If a path is `MM`, the staged and unstaged portions require owner review
  before commit.
- If you need the same files, write a response note that names the blocked paths
  and what you need. Ask the user when the choice affects product behavior or
  when ownership cannot be resolved locally.
- If a note is old but still active, treat it as potentially active until you
  have checked `git status` and read the note. Old age alone is not permission to
  take over.

## Commit Window Coordination

Use the commit window for exclusive access to the Git index and commit operation
in shared checkouts. It does not replace path ownership, active-note checks, or
exact-path staging.

Claims default to 10 minutes and may only be 5-10 minutes. Use the window only
when ready to stage, inspect, commit, amend, rebase, or push follow-through;
release it immediately when that operation completes or aborts.

Claim the window immediately before staging, unstaging, committing, amending,
rebasing, or user-requested commit-and-push work:

```bash
bun git-commit-window claim --owner "<agent/task>" --scope "<commit scope>" \
  --path AGENTS.md --path scripts/git-commit-window.js
```

If another agent already owns the window and waiting is appropriate, use
`wait`. It sleeps until the active lock is released or expires, then atomically
claims the window before telling the waiting agent to proceed:

```bash
bun git-commit-window wait --owner "<agent/task>" --scope "<commit scope>" \
  --path AGENTS.md --timeout-minutes 60 --poll-ms 1000
```

The `wait` timeout controls how long an agent may sleep while another agent owns
the window. The claim it receives after waking still uses the 5-10 minute TTL.

If files are already staged, claim or wait only after inspecting
`git diff --cached --stat` and `git diff --cached --name-only`, then pass
`--allow-staged` when the staged set is intentional and preserved.
`--allow-staged` means "preserve this staged set"; it does not mean "take over
this staged set."

Commit hooks and root checks may read the whole worktree, not only staged files.
When unrelated worker files cause a hook to fail, release the commit window and
record the blocker. Do not patch, format, or stage those unrelated files just to
make your commit pass. Either wait for that lane to hand off, ask the coordinator
to integrate it, or retry when the unrelated dirty files are stable.

Useful operations:

```bash
bun git-commit-window status
bun git-commit-window check --token <token>
bun git-commit-window release --token <token>
bun git-commit-window release --force-stale
```

`release --force-stale` only clears an expired lock. It must not be used to take
over a currently active lock. If an active lock appears stale but is not expired,
read the owner note and ask for arbitration before proceeding.

## Status Transitions

- `working`: you are actively editing or validating the owned paths.
- `blocked`: you cannot proceed without a human or another agent decision.
- `handoff`: another agent can continue; include what remains and what already
  passed or failed.
- `done`: your scoped work is complete; include verification and residual risks,
  then archive the note if no active handoff needs top-level visibility.

Before the final response, update your own note to `done` or `handoff`. If it is
`done`, move it into the archive subtree before replying unless it must remain
visible as an active handoff. Do not commit coordination notes or archived
coordination notes.

## Commit And Verification Hygiene

- Claim or wait for the commit window before changing the staged set or creating
  commits in a shared checkout.
- Stage explicit paths only.
- Inspect staged paths before committing.
- Release the commit window after the commit operation completes or aborts.
- If checks fail on unrelated dirty files, do not fix them for convenience.
  Report the blocker and keep your diff scoped.
- When using commit hooks, keep unrelated dirty files unstaged. If a hook reads
  the whole worktree and fails outside your scope, report that as an unrelated
  blocker instead of widening the patch.
- Only the staged-set owner may use the proof-gated no-verify path, and only
  with exact-path proof for the staged set. Other workers' dirty files are not
  proof that your staged paths are safe.
- Never stage `tmp/agent-coordination/` or its `archive/` subtree.
