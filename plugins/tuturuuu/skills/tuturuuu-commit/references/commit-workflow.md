# Commit Workflow Reference

## Scope Grouping

Group changes by the smallest reason they should be reverted together. A commit
may include tests, translations, and docs when they directly support the same
behavior.

Examples:

- `chore(tooling): require day-old package releases`
  - package manager config
  - development docs that describe the same install policy
- `fix(hive): erase blocks through placement plane`
  - runtime fix
  - focused regression test
- `feat(hive): add agentic world builder chrome`
  - world-builder UI
  - agent engine helper
  - translations and UI tests for that experience
- `docs(codex): add scoped commit skill`
  - plugin skill files
  - plugin manifest and validator updates
  - plugin docs follow-through

## Shared Worktree Staging

Use the commit window plus exact path staging. The commit window serializes Git
index and commit operations; exact staging keeps unrelated human or agent work
out of commits.

Claims default to 10 minutes and may only be 5-10 minutes. Claim only when you
are ready to stage and commit; release the token as soon as the operation
finishes or aborts.

```bash
git status --short
bun git-commit-window claim --owner "<agent/task>" --scope "type(scope): subject"
git add path/to/file-a path/to/file-b
git diff --cached --stat
git diff --cached --name-only
git commit -m "type(scope): short subject"
bun git-commit-window release --token <token>
```

When a path contains shell-special characters such as brackets, quote it.

```bash
git add 'apps/web/src/app/[locale]/(dashboard)/[wsId]/page.tsx'
```

If another agent owns the commit window and the user wants you to wait, use
`wait`. It sleeps until the active lock is released or expires, then claims the
window before telling you to proceed. The wait timeout can be longer than the
claim TTL, but the claimed window still expires after 5-10 minutes:

```bash
bun git-commit-window wait --owner "<agent/task>" --scope "type(scope): subject" \
  --timeout-minutes 60 --poll-ms 1000
```

If files are already staged, inspect them first:

```bash
git diff --cached --stat
git diff --cached --name-only
```

Then pass `--allow-staged` only when the staged set is intentional and must be
preserved. Never use the commit-window lock as permission to stage unrelated
paths, overwrite another agent's work, or skip active coordination notes.

## Hook Failures

If commit hooks fail:

1. Read the first actionable failure.
2. Decide whether the failed file belongs to the staged scope.
3. If it belongs, fix it and rerun the focused validation.
4. If it does not belong, do not format, stage, or repair it just to make the
   commit pass. Report the unrelated blocker.

Use `--no-verify` only when the user explicitly wants the commit to proceed
after focused validation passed and the remaining hook failure is clearly
unrelated.

Always release the commit window after the commit succeeds or after you decide
to abort the commit attempt.
