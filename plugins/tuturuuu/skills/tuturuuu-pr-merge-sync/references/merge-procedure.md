# PR Merge Sync Procedures

## Rollback And Mixed-Version Recovery

For Instant Rollback, incompatible satellite/API versions, or a rollout incident,
use `$tuturuuu-rollout-recovery` and its
[recovery evidence](../../tuturuuu-rollout-recovery/references/recovery-evidence.md).
Keep the current skill's merge and exact-SHA delivery gates; recovery guidance
does not authorize promotion.

## Required Gates

0. Inspect native stack membership first: use the GitHub stack map, `gh stack
   view`, or the PR REST resource's `stack` metadata. Native stacks are the
   daily default for dependent work. A non-main base alone is not a stack:
   ordinary PRs may target production, release, or maintenance branches.
   Without native metadata, check whether the base is another open PR's head
   or the body identifies a parent; that is a manual chain, not a native stack.

       gh api repos/tutur3u/platform/pulls/<pr> --jq '.stack'
       gh pr list --state open --json number,headRefName \
         --jq '.[] | select(.headRefName == "<this-pr-base>") | .number'

   For native stacks, record the authorized contiguous prefix from the lowest
   unmerged PR through the chosen PR. Every included layer must pass gates
   1–5 below against its own current head. Native protections, CODEOWNERS,
   required checks, and PR workflow selection use the stack trunk. Fully linear
   history is required. Coordinate all affected worktrees before cascading
   rebase/sync; recheck changed heads, diffs, checks, and quiet windows.
   Use `gh stack merge <highest-verified-pr> --merge --yes`; selecting a higher
   PR includes all unmerged layers below it. The command has no head-match or
   admin-bypass option, so re-read every selected head immediately beforehand.
   Never substitute the ordinary single-PR merge/admin path for a native stack.
   Queue acceptance is not merge completion: verify every selected PR merged.

   For manual chains, record the native-feature limitation and merge parents
   individually first, using `gh pr merge --merge --match-head-commit <head>`
   to preserve ancestry. Squash/rebase can duplicate landed work in child diffs.
   For either workflow, confirm remaining membership, base, diff, and heads after
   advancing the stack, then rerun affected gates. `gh stack sync` may rewrite
   and push remaining branches; coordinate owners first and avoid automatic
   pruning. See `/build/development-tools/stacked-pull-requests` in `apps/docs`.
1. Perform all open-PR work in an isolated `.worktrees/` checkout and run
   `bun install` immediately after creating it. Use CI for builds.
2. Confirm GitHub auth and rate limits:
   - `gh auth status`
   - `gh api rate_limit`
3. Confirm the PR has zero active unresolved review threads.
4. Wait for the requested quiet window, defaulting to 5 minutes after the
   latest PR comment update, review submission, or pushed commit; use PR
   creation as the minimum start when no activity exists.
5. Wait for PR checks to finish with only `success`, `skipped`, or `neutral`
   conclusions.
6. Merge the PR, preferring normal merge first. Use admin merge only when the
   user requested merge follow-through for an ordinary PR or manual chain and
   GitHub reports a policy-only block after the gates above are clean.
7. Fetch the merge SHA. Fast-forward local `main` only if its checkout is safe
   and owned; do not switch or update another session's checkout.
8. Verify every `main` workflow for the merge SHA is green. This is a hard gate:
   do not run `bun git-sync` while any main workflow is queued, in progress, or
   failed.
9. For main-only integration, skip production gates 10–11 and proceed to
   cleanup at gate 12 after main verification.
   Run `bun git-sync` only with production authorization, after main is fully
   green and the exact promotion range is authorized. If main advanced with unrelated commits, obtain broader
   authorization or use the supported pinned-SHA sync path.
10. For authorized production delivery only, verify remote production contains
    the approved SHA. Report local refs
    separately if another checkout owns them or main has advanced.
11. For authorized production delivery only, verify every `production` workflow
    for that SHA is green.
12. After all required delivery gates pass, remove only the completed clean
    PR worktree and its local task branch.

For a user-authorized direct integration without a PR, apply the same safety
boundary after the scoped current-main commit: wait for the exact main SHA to be
fully green, then complete any authorized production sync and verification
before removing only that completed worktree and its local branch. Never clean blocked, dirty, unmerged,
user-owned, or other-agent-owned lanes.

## Stale Merged-Parent Catalog Recovery

If native rebase starts replaying unrelated landed commits, abort it and inspect
all affected refs/worktrees; fetches can survive an abort. Recover GitHub's native
membership and preserve old heads and local catalog boundaries. Confirm that the
tracked merged parent tip is not an ancestor of the child, while the child range
against fetched trunk contains only the owned remaining changes. Do not resolve
unrelated conflicts to force that replay through.

After coordinating clean, idle owners, a proven stale local boundary can be
rebuilt with `gh stack unstack --local` and
`gh stack init --base main <remaining-bottom> ... <top>`. Keep the remote native
group intact. Inspect the rebuilt catalog, rebase and push through native
commands, then verify server membership, bases, heads and source scope. Rerun
focused regressions and every exact-head merge gate. This local metadata recovery
does not authorize remote unstacking, ordinary admin merges of native layers,
rewriting other owners' work or bypassing any contiguous-prefix requirement.

See the diagnostic steps in
`apps/docs/build/development-tools/stacked-pull-requests.mdx` under
“Recover a stale merged-parent boundary”. Record exact old/new heads and any
partial failure privately in the coordination handoff rather than public docs.

## Watcher Scripts

Prefer the bundled scripts for long waits. They print only changed summaries,
use two-minute polling by default, and exit nonzero on failed checks or active
review threads.

```bash
node <skill-dir>/scripts/watch_pr_ready.mjs \
  --repo tutur3u/platform \
  --pr 123 \
  --quiet-minutes 5
```

```bash
node <skill-dir>/scripts/watch_branch_runs.mjs \
  --repo tutur3u/platform \
  --branch main \
  --commit <merge-sha>
```

The current PR watcher measures comments and submitted reviews only; without
comments it reports an infinite quiet period. Independently enforce the minimum
from PR creation or the latest push, and inspect inline comment updates before
merging. A successful watcher exit alone does not prove those additional clocks.

Use the branch watcher again for `production` after `bun git-sync`.

When CI is running, finish independent work that does not need its result, then
stop active watcher processes and leave the PR, worktree, and task branch
intact. Record the exact SHA, run IDs, pending gates, review activity, and
promotion state in the coordination note, then pause without polling. Continue
through CI in the same turn only when the user explicitly asks for it. Resume
after the user's reminder and recheck all gates against current refs before
merging or syncing.

Use the full coordination-note format in
`plugins/tuturuuu/skills/tuturuuu-platform/references/repository-workflows.md`,
set status to `handoff`, and never stage the note.

## Merge And Sync Flow

For a native stack, verify all selected layers as described in gate 0 and use
`gh stack merge <highest-verified-pr> --merge --yes`. After completion, record
all merged PRs and the resulting trunk SHA, inspect remaining retargeting/heads,
and verify exact-main CI. Stack requirements cannot be bypassed.

For an ordinary PR or manual chain, after the PR watcher exits cleanly:

```bash
gh pr merge <pr> --repo tutur3u/platform --match-head-commit <head-sha> --merge
```

If GitHub reports that branch policy prohibits the merge despite clean gates,
and the user asked for merge follow-through, retry with:

```bash
gh pr merge <pr> --repo tutur3u/platform --match-head-commit <head-sha> --merge --admin
```

Then verify the exact merge SHA. Update local main only in an owned, clean
checkout; the following branch-switch commands are conditional on that ownership:

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
node <skill-dir>/scripts/watch_branch_runs.mjs --repo tutur3u/platform --branch main --commit <merge-sha>
```

Only when production delivery is authorized and main is green:

```bash
bun git-sync
git rev-parse HEAD main production origin/main origin/production
node <skill-dir>/scripts/watch_branch_runs.mjs --repo tutur3u/platform --branch production --commit <merge-sha>
```

## Failure Handling

- If PR checks fail, inspect the failing run/job logs before changing code.
- If active unresolved threads appear, stop and address them through
  `$tuturuuu-review-comments`.
- If main fails after merge, do not run `bun git-sync`; fix or report the main
  blocker first.
- If production fails after `bun git-sync`, inspect production workflow logs and
  fix or report the blocker.
- Keep temporary watcher files under `tmp/` if custom one-off scripts are
  needed; never stage coordination notes or scratch watchers.
- Keep the PR worktree and local task branch when the PR remains open, a required
  gate is blocked, the merge is absent from `main`, main is not fully green,
  or an authorized production sync/verification remains unresolved. Main-only
  integration does not require production promotion before cleanup.
