---
name: tuturuuu-ci-docs
description: "Maintain Tuturuuu GitHub Actions, validation wiring, and operational documentation."
---

# Tuturuuu CI Docs

## Core Workflow

For CI changes, inspect the existing workflow family before adding a new file. Most workflows use `.github/workflows/ci-check.yml` as a reusable switchboard and are enabled from `tuturuuu.ts`.

For docs changes, update the MDX page and `apps/docs/docs.json` together when adding a new page. A page that is not in `docs.json` is not discoverable in the docs site.

Consult `references/ci-docs-checklist.md` for workflow wiring or docs navigation changes.
Read `references/blue-green-patterns.md` when CI/docs work touches Docker web
deployment, blue/green watcher behavior, BuildKit, monitoring, or deployment
runbooks that used to live in root `AGENTS.md`.

If the user asks to commit the finished work, route to `$tuturuuu-commit` and
keep docs, CI, and validator changes split only when they are independently
revertible.

## CI Patterns

- Prefer narrow validation jobs that do not install the full monorepo unless the check needs dependencies.
- Keep plugin and script validators standard-library based when feasible so CI stays fast and stable.
- Add new workflows to `tuturuuu.ts` so the repo CI switchboard can enable or disable them consistently.
- Use read-only permissions for validation jobs unless a workflow truly writes commits, comments, or artifacts.
- Finite builds needed to validate the authorized change may run; starting a long-lived server requires the runtime task to need it. Deployment authority remains separate.

## Documentation Patterns

- Put durable team-facing knowledge in `apps/docs`.
- Prefer updating an existing page when the topic already fits the docs tree.
- Add new pages to `apps/docs/docs.json` in the relevant navigation group.
- Document validation commands and known environment requirements next to the workflow they support.
- Keep runbooks operational and specific: paths, commands, failure modes, and expected outputs are more useful than broad prose.

## Verification

For CI and docs work:

- Run the changed validator directly.
- Parse changed JSON with `python3 -m json.tool`.
- Run formatter/linter commands required by the repo for touched files.
- Run `git diff --check`.
- If root TypeScript config changed, finish with `bun check` when feasible.
