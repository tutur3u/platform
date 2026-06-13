---
name: tuturuuu-commit
description: Tuturuuu scoped commit workflow guidance. Use when the user asks Codex to commit, commit and push, split commits by scope or domain, claim or wait for a commit window, stage work safely in a shared worktree, or report final commit hashes after validation.
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
- Claim the commit window with `bun git-commit-window claim` immediately before
  changing the staged set or committing in a shared checkout. Use
  `bun git-commit-window wait` when another agent owns the window and waiting is
  appropriate.
- Keep the commit window tight: claims default to 10 minutes, only accept
  5-10-minute TTLs, and should be released as soon as commit work finishes or
  aborts.
- Stage only files intentionally changed for the current commit.
- Avoid `git add .` in shared worktrees.
- Keep commits atomic by product domain, package, behavior, or independently
  revertible operational policy.
- Use Conventional Commit subjects that match repo rules.
- Never include secrets, local-only scratch files, or unrelated formatting churn.
- Do not push unless the user explicitly asks for push.
- Let commit hooks run by default. Use `git commit --no-verify` only when the
  current agent has proof-gated no-verify evidence for its exact staged paths.

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

1. Claim or wait for the commit window and keep the token out of notes.
2. Stage the exact paths for that scope.
3. Inspect `git diff --cached --stat` and `git diff --cached --name-only`.
4. Commit with a Conventional Commit subject.
5. Release the commit window after the commit succeeds or aborts.
6. Let commit hooks run unless proof-gated no-verify evidence is complete.

`git commit --no-verify` is allowed only when the current agent can prove the
exact staged files would pass the checks normally covered by `bun check`: it
must own every staged path, record the separated checks it ran, explain why
those checks cover every touched file, and list unrelated dirty files excluded
from the claim. If ownership is unclear, proof is incomplete, or affected checks
cannot be mapped confidently, do not use `--no-verify`.

If a hook fails because of unrelated dirty files or pre-existing repo failures,
do not widen the commit to fix them. Unstage if needed, report the blocker, and
keep the staged scope clean. A complete proof-gated no-verify packet may justify
using `--no-verify`; otherwise leave the hook failure unresolved for the user.

## Final Report

After committing, report:

- commit hashes and subjects
- validation that ran, including hook results
- whether the worktree is clean or what remains dirty
- push status when the user requested a push
