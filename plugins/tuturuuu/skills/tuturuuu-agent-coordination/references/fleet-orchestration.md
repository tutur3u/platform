# Fleet Orchestration Standing Rules

Use when an orchestrator or intake thread owns work across several machines,
projects, provider seats or long-lived threads. These rules supplement
[program orchestration](program-orchestration.md); they do not widen authority.

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

## Replace stuck lead threads, do not revive them

A long-lived lead thread that is stuck or limited is not revived. Hand its remaining
work to a fresh orchestrator subagent with a self-contained brief (goal, owned
paths, current heads, open receipts, remaining acceptance and standing orders),
then settle the old thread. Deliver a completed thread's or subagent's result to its
consumer before settling it.

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

## T3 desktop settings location

A T3 desktop app may read `~/.t3-desktop/userdata/settings.json` instead of
`~/.t3/userdata/settings.json`. Before editing provider instances, check which file
the running server uses.
