---
name: tuturuuu-commit
description: Tuturuuu scoped commit workflow guidance. Use when the user asks Codex to commit, commit and push, split commits by scope or domain, stage work safely in a shared worktree, or report final commit hashes after validation.
---

# Tuturuuu Commit

## Core Workflow

Use this skill when the user explicitly asks for commits, scoped commits,
atomic commits, commit-and-push follow-through, or commit reporting.

Read `references/commit-workflow.md` for examples of scope grouping, staging,
and failure handling before creating commits.

## Guardrails

- Run `git status --short` before staging.
- Treat unknown dirty and untracked files as user-owned or other-agent-owned.
- Stage only files intentionally changed for the current commit.
- Avoid `git add .` in shared worktrees.
- Keep commits atomic by product domain, package, behavior, or independently
  revertible operational policy.
- Use Conventional Commit subjects that match repo rules.
- Never include secrets, local-only scratch files, or unrelated formatting churn.
- Do not push unless the user explicitly asks for push.

## Commit Planning

Before staging, group changed paths by the reason they should be reverted
together. Prefer a small number of meaningful commits over file-by-file commits.

Good split boundaries:

- product behavior fixes
- user-facing feature work
- package or tooling policy changes
- docs-only follow-through for a workflow change
- plugin, skill, or agent-workflow updates

Do not split one behavior across multiple commits just because it touches tests,
translations, docs, or helper modules. Those supporting files belong with the
behavior they validate or expose.

## Staging And Validation

For each commit:

1. Stage the exact paths for that scope.
2. Inspect `git diff --cached --stat` and `git diff --cached --name-only`.
3. Commit with a Conventional Commit subject.
4. Let commit hooks run unless a known unrelated blocker exists and the user has
   enough context to accept `--no-verify`.

If a hook fails because of unrelated dirty files or pre-existing repo failures,
do not widen the commit to fix them. Unstage if needed, report the blocker, and
keep the staged scope clean.

## Final Report

After committing, report:

- commit hashes and subjects
- validation that ran, including hook results
- whether the worktree is clean or what remains dirty
- push status when the user requested a push
