# CI And Docs Checklist

Use this checklist when changing CI, validators, docs, or repo automation.

## CI

- Inspect nearby workflows before adding a new one.
- Use `.github/workflows/ci-check.yml` when the workflow should respect the repo-level `tuturuuu.ts` switchboard.
- Add the workflow filename to `tuturuuu.ts`.
- Prefer `permissions: contents: read` for validation-only jobs.
- Prefer standard-library validators for plugin, docs, and repository metadata checks.
- Keep path-sensitive checks deterministic and run them from the repo root.
- Keep staging and production Supabase migration CI on
  `supabase db push --include-all`; production migration CI stays
  prerequisite-gated on the production platform deployment marker and same-SHA
  staging success.
- Keep `vercel-preview-platform.yaml` on a protected `main` push trigger because
  `supabase-staging.yaml` depends on its completed workflow-run event; other
  preview Vercel workflows remain trusted manual-dispatch only.
- Keep the platform preview affected-path decision inline in its deploy job so
  every protected `main` push still emits the staging workflow-run signal
  without allocating a second runner. Manual-only satellite previews should
  launch their guarded deploy job directly and must not add a redundant
  reusable `check-ci` job.
- Keep commit-driven production Vercel deployments under the production
  planner's push run. Call selected per-app workflows through `workflow_call`
  and reserve `workflow_dispatch` for explicit operator reruns.
- Document and test a unique static concurrency prefix for every reusable
  production app workflow; caller-derived shared keys can cancel sibling jobs
  instead of leaving unselected jobs cleanly skipped.
- Keep preview concurrency keyed by workflow and `preview_ref` with
  `cancel-in-progress: true`; repeated requests for one target should replace
  stale runs without canceling a distinct preview ref.
- Prefer native trigger paths for a broad compatibility smoke only when its
  contract is intentionally path-simple. The external-app internal-package
  smoke owns `apps/external/**`, `packages/**`, and its build-control files, so
  unrelated app-only commits should not create that workflow at all.
- Keep automatic CodeQL in GitHub's organization-managed
  `dynamic/github-code-scanning/codeql` workflow. Keep `codeql.yml` as a
  manual-only JavaScript/TypeScript and Python fallback with no push,
  pull-request, or cron triggers.
- Scope the expensive E2E workflow with native push paths for E2E specs,
  Playwright/Docker configuration, database fixtures, dependency manifests,
  lockfiles, and E2E runner scripts. Do not add a cron schedule; automatic E2E
  runs are commit-driven, while manual dispatch remains available for deliberate
  full validation.
- Resolve Supabase migration changes from the last successful environment
  marker, fail open when that marker is unavailable, and serialize one combined
  evaluate-and-migrate job per environment. Production must retain its same-SHA
  platform deployment marker and successful staging prerequisite.
- For repo-local Codex plugins, keep `.agents/plugins/marketplace.json` present and pointed at `./plugins/<plugin-name>`.

## Docs

- Add new docs pages to `apps/docs/docs.json`.
- Mention exact validator commands next to the system they validate.
- Document known local dependency requirements instead of hiding them in CI.
- Document restart or install steps when Codex must rediscover local plugin marketplace metadata.
- Keep docs focused on operational behavior: what to run, where files live, what the check catches, and what to do when it fails.

## Verification

- Run changed validators locally.
- Parse touched JSON with `python3 -m json.tool`.
- Run `bun ff` on touched docs, scripts, config, and workflow files.
- Run `git diff --check`.
- Run `bun check` when root TypeScript config or repo-wide script/config behavior changed.
