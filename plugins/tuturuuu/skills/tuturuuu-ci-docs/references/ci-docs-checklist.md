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
  prerequisite-gated on production deployment and same-SHA staging success.
- Keep `vercel-preview-platform.yaml` on a protected `main` push trigger because
  `supabase-staging.yaml` depends on its completed workflow-run event; other
  preview Vercel workflows remain trusted manual-dispatch only.
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
