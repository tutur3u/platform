---
name: tuturuuu-review-comments
description: Use when inspecting, re-checking, validating, fixing, resolving, or committing pending and unresolved GitHub pull request review comments for Tuturuuu resources or PR URLs.
---

# Tuturuuu Review Comments

Use this skill when the user asks to check, re-check, revalidate, fix, resolve, or commit pending/unresolved comments for a GitHub PR or review resource.

## Core Rules

- Treat thread-aware review data as authoritative. Flat PR comments are context, but unresolved inline review threads decide what remains pending.
- Verify every comment against current code before changing anything. If a comment is stale, duplicated, non-actionable, or wrong, say so and draft a response instead of forcing a code change.
- After fixing and validating actionable threads, resolve the addressed review threads by default unless the user says not to.
- Do not reply on GitHub, push, or commit unless the user explicitly asks for that write action.
- If the user asks to "fix comments", interpret that as all unresolved, non-outdated, actionable review threads unless they narrow the scope.
- Keep unrelated working-tree changes intact. Include them in a commit only when the user explicitly asks to include them.

## Resolve The Resource

1. If the user gives a PR URL, use it directly.
2. If they give `owner/repo#123`, split it into repo and PR number.
3. If they refer to the current branch, run:
   - `gh auth status`
   - `gh pr view --json number,url,headRefName,baseRefName,title,state`
4. Check out the PR only when fixes are requested:
   - `gh pr checkout <number-or-url>`

Run `gh` commands with network access if sandboxing blocks GitHub.

## Fetch Thread-Aware Comments

Prefer the bundled script:

```bash
python3 <skill-dir>/scripts/fetch_review_threads.py --repo owner/repo --pr 123 > /tmp/pr123-review-threads.json
```

Use built-in summaries for active unresolved threads:

```bash
python3 <skill-dir>/scripts/fetch_review_threads.py --repo owner/repo --pr 123 --active-only --summary > /tmp/pr123-active-review-threads.json
jq -r '.counts.active_unresolved' /tmp/pr123-active-review-threads.json
jq -r '.review_threads[] | [.id, .path, (.line // 0), (.author // ""), .headline] | @tsv' /tmp/pr123-active-review-threads.json
```

The helper also emits `.counts.total`, `.counts.resolved`, `.counts.unresolved`, and `.counts.outdated` for final reports.

If the script is unavailable, use `gh api graphql` to fetch `reviewThreads`, including `id`, `isResolved`, `isOutdated`, `path`, `line`, and `comments.nodes.body`.

## Fix Workflow

1. Fetch active unresolved threads and cluster them by file or behavior.
2. Inspect local code around each anchor before editing.
3. Implement the smallest code changes that directly address validated comments.
4. Update tests, docs, translations, generated files, or migrations when required by the touched surface.
5. Run focused validation first, then the repo-required final check.
6. Resolve threads fixed by the change or confirmed no longer actionable.
7. Re-fetch active threads and report resolved count, remaining count, commits, and validation.

For this repository, combine this skill with the focused Tuturuuu skills when relevant:

- `$tuturuuu-platform` for repo-wide web/shared-code rules and final checks.
- `$tuturuuu-commit` when the user explicitly asks to commit addressed review
  feedback or split fixes by scope.
- `$tuturuuu-database` for Supabase migrations, RLS, generated types, and workspace-scoped API writes.
- `$tuturuuu-ci-docs` for CI, docs, and validator changes.
- `$tuturuuu-mobile-task-board` for Flutter mobile task-board behavior.

## Resolving Threads

Resolve addressed review threads after fixes are validated unless the user says not to. Do not resolve ambiguous, intentionally deferred, or still-failing threads.

Resolve exact thread IDs:

```bash
for thread_id in <ids>; do
  gh api graphql \
    -f query='mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } } }' \
    -F threadId="$thread_id" \
    --jq '.data.resolveReviewThread.thread | [.id, (.isResolved|tostring)] | @tsv'
done
```

Then re-fetch thread state and confirm the remaining active unresolved count:

```bash
python3 <skill-dir>/scripts/fetch_review_threads.py --repo owner/repo --pr 123 --active-only --summary > /tmp/pr123-review-threads-postresolve.json
jq -r '.counts.active_unresolved' /tmp/pr123-review-threads-postresolve.json
```

## Commit Workflow

Only commit when explicitly asked. Use `$tuturuuu-commit` for staging, scope
splitting, Conventional Commit subjects, and final commit reporting. Include
resolved thread count, remaining active unresolved thread count, and validation
results in the final review-comment report.
