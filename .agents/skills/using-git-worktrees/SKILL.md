---
name: using-git-worktrees
description: "Create an isolated Git worktree when current work needs a separate branch and working directory."
---

# Isolated Git Worktrees

Use an isolated worktree when concurrent edits, an open PR, or risky branch operations
need a separate working directory and index. Inspect status and existing worktrees;
preserve user-owned work and use the repository's directory and branch conventions.
Otherwise prefer an existing ignored worktree directory, or `.worktrees/` when suitable.
Verify a project-local directory is ignored before creating it. Do not force-checkout
an occupied branch or reset another worktree.

Create the worktree from the intended base with `git worktree add <path> -b <branch>
<base>`. Run the repository's documented setup; do not infer a build of every ecosystem
from the presence of a manifest. For Tuturuuu use `SKIP_PORTLESS_SETUP=1 bun setup`
in non-interactive shells. Validate the relevant baseline when needed to distinguish
pre-existing failures from the requested change, and continue disjoint authorized work.

Track the worktree's branch, owned changes, and validation. Integrate through the
user-authorized commit/PR/release path. Remove only a clean, completed worktree whose
changes are confirmed integrated and whose required delivery checks passed. Preserve
unmerged or blocked worktrees and report why they remain.
