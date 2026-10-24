---
name: tuturuuu-agent-coordination
description: "Coordinate Tuturuuu multi-agent programs, exact-head evidence, shared-worktree ownership, and handoffs."
---

# Tuturuuu Agent Coordination

Protect existing work with `git status --short`, path ownership, and a separate
worktree when needed. Inspect top-level active `tmp/agent-coordination/` notes
before overlapping work; missing/noncanonical statuses remain active. Never take
ownership merely because a note is old. Archives are historical context, not locks.

Notes and commit windows are per-checkout. Separate worktrees coordinate through
branches and the remote. Open PR work belongs in `.worktrees/` with immediate
`bun install`. `bun setup` runs builds; use CI build checks instead.

Read the relevant section of `references/coordination-protocol.md` for overlap,
handoffs, delegated lanes, generated-output isolation, or cleanup. Create a note
for shared/dirty, overlapping, long-running, or tooling-rule changes. Include Agent,
Intent, Owned paths, Observed dirty paths, Status, Needs, Verification, Risks, and
Commit window. Use statuses `working`, `blocked`, `handoff`, or `done`; never stage notes.

For multi-lane work spanning PR/CI/delivery wakes, use
`references/program-orchestration.md`: own the program board and acceptance,
relay complete briefs, drain completed handoffs, and reconcile exact-head proof.
Use its [autonomy contract](references/program-orchestration.md#autonomy-and-asynchronous-waits) for useful child work during asynchronous waits, inherited briefs and bounded workflow audits. Standing user delegation instructions apply within task authority and actual runtime/resource limits.
Its operating model sets roles, the shared subagent allocation, lead budget grants and receipts; check declared allocations with `node scripts/ci/check-agent-budget.js`. Apply `references/security-default.md` to every lane: change-triggered checks, independent review for auth/RLS/CI/token/storage changes, and finding fields.
For assigned ongoing idea/bug/feature intake, read `references/request-backlog.md`:
capture each outcome before dispatch, recover durable requests on every wake, and
keep implemented work distinct from verified delivery.

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
