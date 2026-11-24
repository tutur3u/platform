# Fleet Orchestration Standing Rules

Use when an orchestrator or intake thread owns work across several machines,
projects, provider seats or long-lived threads. These rules supplement
[program orchestration](program-orchestration.md); they do not widen authority.
The team-facing summary is the
[fleet blocker recovery](../../../../../apps/docs/build/devops/fleet-blocker-recovery.mdx#orchestrator-standing-rules)
page.

## Keep the orchestrator responsive

Orchestrator and intake threads never run expensive or long commands themselves:
multi-host scans, inventories, cleanups, installs, large greps or extractions,
gate runs and waiting logins. Delegate each to a subagent with a self-contained
brief and stay available to the user. A short read-only status check is fine.

## Resume on any admitted seat

When a provider seat hits a usage limit, resume the work on any admitted seat with
headroom; never park it waiting for the original seat's reset.

- Check headroom with `bun packages/agent-quota/src/cli.ts status` and the
  orchestrator capabilities of each machine. Unknown or stale quota is not headroom.
- Check every linked machine and every project, not just the local one.
- Follow the reset-only reroute procedure in
  [quota-aware delegation](program-orchestration.md#quota-aware-delegation):
  preserve queued text and dirty files, and confirm a task-bound running
  continuation on the new seat.
- Verify the resumed run within five minutes, under the
  [exhaustion handling](../../../../../apps/docs/build/devops/fleet-blocker-recovery.mdx#d1336-v2-exhaustion-handling)
  steps.

## Hand off limited or stuck threads, then settle

A long-lived thread that is stuck, or limited with no quick reroute, is not revived.
Hand its remaining work to a fresh child with a self-contained brief (goal, owned
paths, current heads, open receipts, remaining acceptance and standing orders).
Settle the old thread only after its work has landed, or has been preserved and its
result delivered to the consumer. Deliver a completed thread's or subagent's result
to its consumer before settling it.

## Fleet worktree ownership

The orchestrator owns every fleet machine's worktrees and branches. Each must have a
live owner or be safe to remove. Safe removal requires all of:

- merged (patch-equivalent, so squash merges count);
- no tracked or untracked changes;
- not held and not locked;
- idle (no live process or thread using it).

Never force-remove. Never delete unique unmerged work or dirty files without the
owner's or the user's decision. Anything failing a condition keeps its owner, or is
reported for a decision.

### Preserve-first orphan triage

For a worktree or branch that fails a removal condition and has no live owner:

1. Preserve it before anything else: a `git bundle` of the commits not on
   `origin/main` plus a patch of tracked and untracked changes, with a checksum
   file, under durable scratch storage (never `/tmp`, which a reboot clears).
   Run `git bundle verify` on the result.
2. Record one row per item: machine, path, branch, head, commits ahead and behind
   `origin/main`, dirty-file count, whether it is already on main by subject or
   patch, and the bundle path.
3. Give the row an owner: an existing lane that should consume it, a new child, or
   a decision request. A preserved item is still not removed until it is merged or
   its owner or the user decides.

## T3 desktop settings location

A T3 desktop app may read `~/.t3-desktop/userdata/settings.json` instead of
`~/.t3/userdata/settings.json`. Before editing provider instances, check which file
the running server uses.

## Migration version registry

Parallel lanes can pick the same migration timestamp, which `check:changed` only
catches once both are on one checkout. Before choosing a version, read the
orchestrator's migration-stamp registry and ask the orchestrator to reserve one;
record the reserved version there.
