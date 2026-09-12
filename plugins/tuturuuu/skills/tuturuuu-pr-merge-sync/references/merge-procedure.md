# PR Merge Sync Procedures

## Required Gates

0. Check whether the PR is part of a stack. A base other than `main` is not
   proof: a PR can legitimately target `production`, a release branch, or a
   maintenance branch with no parent PR at all, and treating those as stacked
   blocks valid closeout work. It is a stack only when the base branch is the
   head branch of an open pull request, or the PR body names its parent:

       gh pr list --state open --json number,headRefName \
         --jq '.[] | select(.headRefName == "<this-pr-base>") | .number'

   When it is stacked, the parent must merge first — merging a child while its
   parent is open pulls the parent's unreviewed commits into `main` through the
   child, and merging a mid-stack or top PR merges everything below it. Merge
   bottom-up, one PR at a time, running every gate below for each.

   A native stack (`gh stack`) rebases and retargets the rest on merge and
   accepts any merge method. A base-chained stack (`gh pr create --base`) does
   not: merge its parents with `gh pr merge --merge`, because a squash or
   rebase merge leaves the parent's commits outside `main`'s ancestry and the
   retargeted child re-shows changes that already landed. Either way, confirm
   each child's `baseRefName` actually moved before treating the stack as
   advanced. See `/build/development-tools/stacked-pull-requests` in
   `apps/docs`.
1. Perform all open-PR work in an isolated `.worktrees/` checkout and run
   `bun setup` immediately after creating it.
2. Confirm GitHub auth and rate limits:
   - `gh auth status`
   - `gh api rate_limit`
3. Confirm the PR has zero active unresolved review threads.
4. Wait for the requested quiet window, defaulting to 30 minutes after the
   latest PR comment update, review submission, or pushed commit; use PR
   creation as the minimum start when no activity exists.
5. Wait for PR checks to finish with only `success`, `skipped`, or `neutral`
   conclusions.
6. Merge the PR, preferring normal merge first. Use admin merge only when the
   user requested merge follow-through and GitHub reports a policy-only block
   after the gates above are clean.
7. Fetch the merge SHA. Fast-forward local `main` only if its checkout is safe
   and owned; do not switch or update another session's checkout.
8. Verify every `main` workflow for the merge SHA is green. This is a hard gate:
   do not run `bun git-sync` while any main workflow is queued, in progress, or
   failed.
9. Run `bun git-sync` only after main is fully green and the exact promotion
   range is authorized. If main advanced with unrelated commits, obtain broader
   authorization or use the supported pinned-SHA sync path.
10. Verify remote production contains the approved SHA. Report local refs
    separately if another checkout owns them or main has advanced.
11. Verify every `production` workflow for that SHA is green.
12. After all required delivery gates pass, remove only the completed clean
    PR worktree and its local task branch.

For a user-authorized direct integration without a PR, apply the same safety
boundary after the scoped current-main commit: wait for the exact main SHA to be
fully green, run `bun git-sync`, verify production, then remove only that
completed worktree and its local branch. Never clean blocked, dirty, unmerged,
user-owned, or other-agent-owned lanes.

## Watcher Scripts

Prefer the bundled scripts for long waits. They print only changed summaries,
use two-minute polling by default, and exit nonzero on failed checks or active
review threads.

```bash
node <skill-dir>/scripts/watch_pr_ready.mjs \
  --repo tutur3u/platform \
  --pr 123 \
  --quiet-minutes 30
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

## Merge And Sync Flow

After the PR watcher exits cleanly:

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

Only after main is green:

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
  `bun git-sync` has not completed, or production follow-through is unresolved.
