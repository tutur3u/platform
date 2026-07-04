---
name: tuturuuu-pr-merge-sync
description: Use when a Tuturuuu pull request should be merged only after review comments are resolved, no new review or PR comments arrive for a quiet window, PR checks pass, main is fully green after merge, `bun git-sync` runs, and production branch checks pass.
---

# Tuturuuu PR Merge Sync

Use this skill for end-to-end PR closeout requests that go beyond fixing review
comments: quiet-window watching, merge, mandatory main-green verification,
`bun git-sync`, and production-green verification.

## Compose With Focused Skills

- Use `$tuturuuu-review-comments` first when unresolved review threads need
  inspection, fixes, replies, or resolution.
- Use `$tuturuuu-commit` before staging, committing, amending, rebasing, or
  any user-requested commit/push work.
- Use `$tuturuuu-agent-coordination` when the checkout is shared, dirty, or the
  work will take long enough to need a coordination note.
- Use `$tuturuuu-ci-docs` only when CI workflow behavior or docs navigation
  must be changed.

## Required Gates

1. Confirm GitHub auth and rate limits:
   - `gh auth status`
   - `gh api rate_limit`
2. Confirm the PR has zero active unresolved review threads.
3. Wait for the requested quiet window, defaulting to 30 minutes after the
   latest PR comment update or review submission.
4. Wait for PR checks to finish with only `success`, `skipped`, or `neutral`
   conclusions.
5. Merge the PR, preferring normal merge first. Use admin merge only when the
   user requested merge follow-through and GitHub reports a policy-only block
   after the gates above are clean.
6. Fetch and fast-forward local `main` to `origin/main`.
7. Verify every `main` workflow for the merge SHA is green. This is a hard gate:
   do not run `bun git-sync` while any main workflow is queued, in progress, or
   failed.
8. Run `bun git-sync` only after main is fully green.
9. Verify local and remote `main` and `production` point to the same SHA.
10. Verify every `production` workflow for that SHA is green.

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

Use the branch watcher again for `production` after `bun git-sync`.

## Merge And Sync Flow

After the PR watcher exits cleanly:

```bash
gh pr merge <pr> --repo tutur3u/platform --merge
```

If GitHub reports that branch policy prohibits the merge despite clean gates,
and the user asked for merge follow-through, retry with:

```bash
gh pr merge <pr> --repo tutur3u/platform --merge --admin
```

Then update and verify `main`:

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

## Final Report

Report the PR URL, merge SHA, quiet-window result, review-thread count, PR check
summary, main workflow result, `bun git-sync` result, production workflow result,
final branch refs, rate-limit status if checked, and remaining risks.
