# Shared Worktree Coordination Protocol

This protocol keeps concurrent human and agent work from overwriting each other.
It complements `git status`; it does not replace it.

## Scope: One Checkout Vs Separate Worktrees

The coordination substrate in this repo is **per-checkout**. Both the notes under
`tmp/agent-coordination/` and the commit-window lock at
`tmp/agent-coordination/git-commit-window.lock.json` live inside the working
directory, and the lock script resolves its root from its own file location
(`scripts/git-commit-window.js` -> repo root of *that* checkout). This has two
direct consequences:

- **Same checkout (most common).** Multiple agents and humans sharing one working
  directory — parallel Codex or Claude Code sessions, background tasks, and
  subagents launched in the same directory — all see the same notes and contend
  for the same commit window. Notes + window are the live coordination signal
  here. This is the default case this protocol addresses.
- **Separate `git worktree` checkouts.** A linked worktree (`git worktree add`,
  Claude Code / Workflow `isolation: worktree`, or an agent given its own
  worktree) has its own working directory, its own `tmp/agent-coordination/`,
  its own commit-window lock file, and its own Git index. Notes written in one
  worktree are invisible to another, and the commit window does **not** serialize
  commits across worktrees. Do not rely on either to coordinate across separate
  worktrees.

Separate worktrees are instead isolated by **branch and index**: Git refuses to
check out the same branch in two worktrees, so each worktree is on a distinct
branch with a distinct index, and concurrent edits/commits there cannot corrupt
each other. They converge later through the shared object database and remote
(merge, rebase, `bun git-sync`, or a PR), not through notes or the window. Use an
isolated worktree precisely when parallel work would otherwise fight over one
index or tree (mass refactors, conflicting large edits, risky rebases); use the
shared-checkout notes + window when agents must cooperate in one directory.

## Branch Posture

- Default to committing on the working branch the user handed you. Do not create
  a new branch unless the user asks or you are intentionally isolating work in a
  separate worktree.
- When you do branch (including the branch a new worktree creates), use a name
  the repo checker accepts: `feature/`, `feat/`, `fix/`, `bugfix/`, `hotfix/`,
  `release/`, `chore/`, `docs/`, `style/`, `refactor/`, `perf/`, `dependabot/`,
  or `claude/`.
- Long-running or conflict-prone parallel work belongs on its own branch/worktree
  and integrates back through a merge/rebase/PR, not by piling uncommitted edits
  into a hot shared checkout.
- If unrelated dirty files already touch shared generated inputs or outputs
  such as `apps/tanstack-web/src/routeTree.gen.ts`, migration manifests,
  `packages/internal-api/src/index.ts`, generated DB types, message bundles, or
  `bun.lock`, new implementation work should default to an isolated worktree or
  read-only audit. Stay in the shared checkout only when the write set is clearly
  disjoint and no generator, root formatter, or repo-wide check will sweep those
  files into the current commit.
- `bun git-sync` fast-forwards `main` and release branches through a temporary
  detached worktree and leaves the current checkout untouched. It is the safe way
  to advance shared branches; never hand-reset a shared branch other agents are
  working on.

## Harness-Agnostic Coordination

This protocol is the same regardless of which harness an agent runs under — Codex,
Claude Code, or another tool. They all read the same `git status`, the same
`tmp/agent-coordination/` notes (in a shared checkout), and the same commit
window. Cooperate through those shared artifacts, never through harness-internal
state another tool cannot see.

- Put the harness and a session/agent id on the note's `Agent:` line so others
  know which tool owns it, e.g. `claude-code/<session>` or `codex/<session>`.
- Subagents and background tasks spawned **in the same checkout** share the
  parent's notes and window — give them disjoint owned paths and a no-commit
  boundary unless a lane explicitly owns a commit. Subagents in an **isolated
  worktree** do not; coordinate those by branch.
- Any harness or human can run destructive Git (rebase, reset, checkout, stash)
  in a shared checkout. Coordination notes are advisory and do not prevent it.

## Protect Uncommitted Work

A hot shared checkout (rapid concurrent commits from several agents) makes large
uncommitted working sets fragile: a concurrent rebase, `reset --hard`, branch
`checkout`, or `stash` by any agent or human can discard unstaged edits that are
not in the object database, with no stash left behind. `bun git-sync` itself is
now isolated and safe, but manual destructive Git in the shared checkout is not.

- Commit early and often in small, scoped commits instead of accumulating a large
  uncommitted multi-file set.
- After a big multi-file generation or refactor, claim the commit window and
  commit your owned paths promptly rather than leaving them exposed.
- If you must hold uncommitted work, keep your coordination note current so other
  agents avoid destructive operations over your paths.

## Triage

1. Run `git status --short`.
2. If `tmp/agent-coordination/` exists, inspect top-level active notes:

   ```bash
   rg -n "^Status: (working|blocked|handoff)" tmp/agent-coordination --glob "*.md" --glob "!archive/**"
   ```

   Do not scan the archive first. Archived notes are for targeted context, not
   live ownership.
   `Status:` values must be exactly `working`, `blocked`, `handoff`, or `done`.
   Put details such as `committed`, `done with concerns`, or follow-up context
   in `Needs:`, `Verification:`, or `Risks:`. Treat missing or noncanonical
   statuses as active until you read the note and resolve the ambiguity.
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

Every delegated lane should have a written contract before the worker starts:

- `Owner`: worker/session id or `read-only explorer` when no files may change.
- `Mode`: read-only audit, implementation, generator/integration, or
  verification.
- `Lifecycle`: `pending`, `active`, `handoff`, `integrated`, or `closed`.
- `Owned paths`: exact files/directories the worker may edit.
- `Excluded paths`: generated artifacts, active-note paths, or dirty files the
  worker must not touch.
- `Generated outputs`: who regenerates route trees, manifests, OpenAPI,
  sorted translations, docs navigation, or DB types.
- `Validation`: focused commands the worker should run, plus any repo-wide
  checks the coordinator will run later.
- `Handoff`: expected final shape: changed files, validation results, blockers,
  generated drift, parity gaps, and whether anything was staged.
- `Commit authority`: default `none`; only one lane may own staging/commit
  authority for a checkpoint.

Use these concrete lane patterns:

- **Read-only audit lane.** Owns no files. It may inspect status, source,
  tests, and active notes, then returns evidence, recommended owned paths, risk,
  and validation commands. Use this before assigning a risky implementation
  lane or when another note already owns nearby files.
- **Implementation lane.** Owns exact source files or a narrow directory. It may
  edit only those paths and must leave generated fan-in files to the
  coordinator unless the prompt explicitly assigns them too. Default commit
  authority is `none`.
- **Generator lane.** Runs a known generator after all relevant input lanes are
  stable. It owns both the generator input set and output artifact list, records
  dirty-input checks, and reports any output that includes unrelated or
  untracked files instead of committing it silently.
- **Integration lane.** Usually the coordinator. It reviews worker diffs,
  applies or rejects handoffs, owns shared generated artifacts, runs combined
  validation, and is the only lane allowed to claim a commit checkpoint unless a
  different lane was explicitly assigned commit authority.

Do not assign two implementation workers to overlapping write paths while both
lanes are active. If a worker is continuing a previous lane, record that explicit
takeover or continuation in the parent note and mark the previous lane
`handoff`, `integrated`, or `closed`.

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
When using Codex subagents, do not combine a full-history fork with an explicit
agent role override; that spawn shape is rejected by the harness. If the role is
important, spawn the typed worker or explorer with the lane context in the
prompt. If the full thread history is more important, omit the role override and
state the expected mode in the prompt.

### Disjoint Write Ownership Patterns

Write ownership must be disjoint enough that two workers can make progress
without guessing which diff wins:

- **Exact-file lane.** Prefer for single API routes, docs pages, scripts, and
  skill references. The lane may edit only the listed files. If it discovers a
  needed adjacent file, it asks for a lane update instead of taking it.
- **Directory lane with exclusions.** Use only when the directory is cohesive
  and no active note owns files inside it. List excluded generated files,
  message bundles, lockfiles, and active-note paths explicitly.
- **Single-file contention.** If two workers need the same file, make one
  read-only, serialize them through a `handoff`, or have the coordinator apply
  both changes manually. Do not let two active implementation lanes patch the
  same file in parallel.
- **Shared generated output.** Treat fan-in artifacts as coordinator-owned by
  default. Workers update source inputs and leave `Needs: Coordinator
  regenerate <artifact>` in their note or handoff.
- **Staged-file boundary.** A staged path belongs to the staging agent or
  coordinator until reassigned. Other workers may keep editing disjoint
  unstaged files but must not stage, unstage, amend, or commit.

Workers should hand off with:

- changed files
- validation commands and pass/fail results
- generated files they intentionally left for the coordinator
- unrelated failures that blocked broader validation
- known parity gaps or follow-up risks
- confirmation that nothing was staged or committed

Use this integration handoff format for worker final messages or `handoff`
notes:

```md
Status: handoff
Changed paths:
- <path>
Generated/integration paths:
- <artifact left unchanged for coordinator, or None>
Validation:
- `<command>`: pass | fail | blocked (<short reason>)
Unrelated blockers:
- <dirty path or failing check outside lane, or None>
Coordinator needs:
- <regenerate/review/commit action, or None>
Risks:
- <parity gap, race, or follow-up risk, or None>
Staging/commit:
- Nothing staged or committed.
```

If a worker did stage or commit because its prompt explicitly granted commit
authority, replace the last line with the staged path list, commit hash, and
commit-window release confirmation. Otherwise, "nothing staged or committed" is
mandatory.

The coordinator reviews worker diffs before staging. If a worker's handoff
requires generated artifacts, the coordinator either owns that regeneration or
spawns a dedicated generator lane after all inputs are stable.

### Coordinator Checkpoints

For broad migrations, checkpoint after each integrated slice before spawning or
merging more lanes. A checkpoint is a short state update, not a planning essay:

- refresh `git status --short`
- close completed subagents in the harness so stale lanes do not consume
  concurrency, and mark their parent-note lane `integrated` or `closed`
- update the parent note with commit hash or handoff status
- list validation that passed and any repo-wide blockers outside the staged set
- list remaining unrelated dirty paths the coordinator will not touch
- decide the next non-overlapping lane from current status, not from stale
  assumptions

If a checkpoint commits, stage exact paths only and keep the commit window just
for staging/commit. If a hook fails because of unrelated worker files, record
the proof for the staged set before using `--no-verify`; otherwise release the
window and report the blocker.

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
Agent: <harness/session-or-agent-id, e.g. claude-code/<session> | codex/<session>>
Intent: <one-line task summary>
Checkout: <shared main checkout | worktree <name/branch>>  # only when not the shared main checkout
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

Name the harness and session on the `Agent:` line so a different tool reading the
note knows who owns it. Add the `Checkout:` line only when you are working in a
separate worktree or non-default branch — it tells same-checkout agents that your
note's paths are being edited elsewhere and that the commit window you hold is
local to that worktree.

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

### Dirty-Checkout Generation

Generators see the filesystem, not coordination intent. In a shared checkout,
untracked or dirty inputs from another lane can be swept into route trees,
OpenAPI snapshots, docs navigation, generated manifests, or sorted locale files
even when those source files are not staged. Before running a generator, ask:

- Which source globs does the generator scan?
- Are any matching dirty or untracked paths owned by another active note?
- Would the generated artifact compile or validate if those other paths are not
  staged in the same commit?

If any answer is uncertain, do not run the generator directly in the dirty
checkout. Use one of these safer patterns:

- Run the generator in a clean detached worktree at the intended base commit,
  copy in only the source files owned by the current lane, then copy back only
  the generated artifact.
- Temporarily pass an explicit input/output path when the generator supports it.
- Split source and generated work so the lane that owns the dirty inputs also
  owns the generated artifact and can stage them together.
- Leave `Needs: Coordinator regenerate <artifact>` in the worker handoff and let
  the coordinator regenerate after all relevant lanes are stable.

When using a temporary worktree, remove it before handoff and record the method
in `Verification:`. Never stage or commit a generated artifact that references
untracked source files from another lane; it creates a committed tree that
fails in a clean checkout.

Record a clean-tree generation packet in `Verification:` when you use this
pattern:

- base commit used for the clean tree
- source globs the generator scanned
- lane-owned inputs copied into the clean tree, if any
- generator command and output artifact paths
- copied-back artifacts
- cleanup command or temporary path removal
- proof that the generated output does not reference untracked or other-lane
  files

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

For commits made in a dirty shared checkout, record a closeout packet in the
parent note before moving on:

- staged path list
- validation commands and results for the staged set
- hook result, or proof-gated `--no-verify` rationale when unrelated files block
  the hook
- commit hash
- commit-window release confirmation
- remaining dirty-path summary and owner assumptions

### Commit-Window Closeout Pattern

Use this sequence for any commit or staged-set change in a shared checkout:

1. Refresh `git status --short` and confirm your owned paths still match the
   active notes.
2. Inspect any existing staged files with `git diff --cached --name-only`. If
   they are not yours, do not proceed unless the owner reassigned them.
3. Claim or wait for the commit window immediately before touching the index.
4. Stage only exact deliverable paths. Never use a broad add command from the
   repo root in a dirty shared checkout.
5. Re-inspect staged paths and verify no `tmp/agent-coordination/` or
   `tmp/agent-coordination/archive/` files are staged.
6. Run the intended commit command or abort if validation/staged ownership is
   wrong.
7. Release the commit window immediately after commit success, hook failure, or
   abort.
8. Update the coordination note with the closeout packet and remaining dirty
   owner assumptions.

If a coordination note is accidentally staged while you hold the window, unstage
that exact note before committing. If you notice it outside a claimed window,
claim or wait first because unstaging changes the shared index.

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
- Inspect staged paths before committing, including:

  ```bash
  git diff --cached --name-only
  git diff --cached --name-only -- tmp/agent-coordination
  ```

  The second command must print nothing for a deliverable commit.
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
- Do not include coordination notes in PR patches, release commits, or docs
  commits. Notes should be marked `done` or `handoff` and, when complete,
  archived as local workflow state outside the staged deliverable set.
