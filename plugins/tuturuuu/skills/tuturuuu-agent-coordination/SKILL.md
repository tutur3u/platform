---
name: tuturuuu-agent-coordination
description: "Coordinate Tuturuuu shared-worktree ownership, handoffs, and Git commit windows."
---

# Tuturuuu Agent Coordination

Protect existing work with `git status --short`, path ownership, and a separate
worktree when needed. Inspect top-level active `tmp/agent-coordination/` notes
before overlapping work; missing/noncanonical statuses remain active. Never take
ownership merely because a note is old. Archives are historical context, not locks.

Notes and commit windows are per-checkout. Separate worktrees coordinate through
branches and the remote. Open PR work belongs in `.worktrees/` with immediate
`SKIP_PORTLESS_SETUP=1 bun setup` in non-interactive shells.

Read the relevant section of `references/coordination-protocol.md` for overlap,
handoffs, delegated lanes, generated-output isolation, or cleanup. Create a note
for shared/dirty, overlapping, long-running, or tooling-rule changes. Include Agent,
Intent, Owned paths, Observed dirty paths, Status, Needs, Verification, Risks, and
Commit window. Use statuses `working`, `blocked`, `handoff`, or `done`; never stage notes.

Before staging or committing, inspect existing staged paths and claim the window:

```bash
bun git-commit-window claim --owner "<agent/task>" --scope "<commit scope>"
```

Use `wait` if occupied; release with `bun git-commit-window release --token <token>`
after completion or abort. Claims last 5–10 minutes. The lock grants no file ownership.
Stage only owned paths. Existing staged work belongs to its owner; do not change it.

For requested integration, retain work until the scoped commit is on main, exact-SHA
main CI passes, `bun git-sync` completes, and production verification passes.
Clean up only the completed clean worktree and its task branch. Finish the note with
verification and risks; archive your own `done` note under `archive/<YYYY>/` when no
handoff needs visibility. Preserve blocked, unmerged, and other-owned work.
