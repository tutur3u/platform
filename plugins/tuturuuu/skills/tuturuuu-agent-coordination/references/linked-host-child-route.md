# Linked-host child route

A linked host rejects `isolation:"worktree"`. Call `delegate_task` with `target.environmentId` set to that linked host and with that host's own project. Do not pass an `isolation` option.

The child's first action is `t3_worktree_handoff` with `runSetupScript` false. It verifies that its worktree path differs from the project root and leaves the root untouched.

On a host without `ttr`, run one frozen install, then a single-worker focused run after a load and memory pre-check.

Push sources to a non-main task branch after gitleaks, for the child to fetch.

The same route is in the shared workflow reference: `~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#linked-host-child-route`.
