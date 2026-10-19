---
name: tuturuuu-pr-merge-sync
description: "Complete authorized Tuturuuu PR merges or main-to-production sync with exact-SHA CI verification."
---

# Tuturuuu PR Merge Sync

Complete the requested integration through review resolution, the quiet window,
merge, and exact-SHA main CI. Run `bun git-sync` and production verification only
when production delivery is authorized. Keep open PR work in an isolated `.worktrees/` checkout with immediate `bun install`.
Use exact-head CI for builds; do not run builds or build-triggering setup locally.

Read `references/merge-procedure.md` for Required Gates, native asynchronous continuation, and
failure recovery when preparing a merge or sync. Native GitHub stacks are the
standard for dependent PR work. Load `.agents/skills/gh-stack/SKILL.md` for
upstream command mechanics; read the stack policy's repository corrections
before recovery or restructuring. Repository ownership and gates take precedence.
Verify native membership and the complete
contiguous prefix selected for merge; run every gate for each included PR.
Use `gh stack merge <highest-verified-pr> --merge --yes` for native stacks,
rechecking all heads immediately beforehand. Installed v0.2.1 has no head-match
or admin-bypass option; the native asynchronous REST API supports `sha` and
boolean `bypass_rules`. For explicitly user-authorized administrator merges,
use that API only for the current bottom PR with its pinned SHA and actor bypass
permission; normal atomic prefix merging remains the default. Preserve all
complete-prefix CI, review, quiet-window and head-pin gates. After the bottom
merges, re-read remaining native membership, heads/bases and those gates before
each successor. Follow the stack policy's “Authorized native administrator merge”
procedure: inspect HTTP 200 bodies and actual PR state, GET only when a UUID is
present, and never blindly retry a 409 or unknown outcome.
Manual base chains are a recorded fallback: merge parents individually with
merge commits and verify child retargeting. A non-main base alone proves neither
native membership nor a dependency. Follow the stack policy in `apps/docs` for
creation, cascading updates, worktree ownership, and cleanup.

Use the requested quiet duration (5 minutes if unspecified). New comments or
review activity or pushed commits restart it; with no comments, start at PR
creation. Fresh commits require checks/review against the new head. Recheck the
PR number, head, unresolved threads, activity, and terminal checks immediately before merging; use `--match-head-commit <head-sha>` for
ordinary PRs and manual chains.
Normal merge is first choice. Admin merge for ordinary PRs is limited to
requested merge follow-through with a policy-only block after all other gates are clean.

Do not sync until every workflow on the exact merge SHA is green. Fetch again
before sync: if main advanced with unrelated commits, retain the approved SHA
and obtain authorization for broader promotion. Do not move a shared checkout
or claim local branch equality when its owner prevents updating it.

Read the review-comments skill when threads need work and the commit skill when
staging or committing. Those operations stay within the user's authorized scope.
Keep the worktree until all requested delivery gates are complete; remove
only the completed clean worktree and its local task branch. Report PR/merge SHA,
quiet-window evidence, check outcomes, sync result, and remaining delivery limits.
