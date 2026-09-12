---
name: tuturuuu-pr-merge-sync
description: "Complete authorized Tuturuuu PR merges or main-to-production sync with exact-SHA CI verification."
---

# Tuturuuu PR Merge Sync

Complete the requested integration through review resolution, the quiet window,
merge, exact-SHA main CI, `bun git-sync`, and production verification. Keep open
PR work in an isolated `.worktrees/` checkout with immediate `bun setup`.

Read `references/merge-procedure.md` for Required Gates, watcher commands, and
failure recovery when preparing a merge or sync. For a stack, inspect its stack
gate before merging: parents first; base-chained parents use merge commits and
children must retarget. A non-main base alone does not prove a stack.

Use the requested quiet duration (30 minutes if unspecified). New comments or
review activity or pushed commits restart it; with no comments, start at PR
creation. Fresh commits require checks/review against the new head. Recheck the PR number, head, unresolved threads, activity, and terminal
checks immediately before merging; use `--match-head-commit <head-sha>`.
Normal merge is first choice. Admin merge is limited to requested merge
follow-through with a policy-only block after all other gates are clean.

Do not sync until every workflow on the exact merge SHA is green. Fetch again
before sync: if main advanced with unrelated commits, retain the approved SHA
and obtain authorization for broader promotion. Do not move a shared checkout
or claim local branch equality when its owner prevents updating it.

Read the review-comments skill when threads need work and the commit skill when
staging or committing. Those operations stay within the user's authorized scope.
Keep the worktree until required production verification is complete; remove
only the completed clean worktree and its local task branch. Report PR/merge SHA,
quiet-window evidence, check outcomes, sync result, and remaining delivery limits.
