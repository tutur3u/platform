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

Use exact path staging. This keeps unrelated human or agent work out of commits.

```bash
git status --short
git add path/to/file-a path/to/file-b
git diff --cached --stat
git diff --cached --name-only
git commit -m "type(scope): short subject"
```

When a path contains shell-special characters such as brackets, quote it.

```bash
git add 'apps/web/src/app/[locale]/(dashboard)/[wsId]/page.tsx'
```

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
