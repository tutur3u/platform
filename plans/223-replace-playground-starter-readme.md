# Plan 223: Replace the Playground Starter README

> **Executor instructions:** Replace the stock Create Next App instructions
> with the actual Bun, Portless, source-path, and verification workflow for this
> repository's Playground app.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- apps/playground/README.md apps/playground/package.json apps/playground/src/app/page.tsx apps/docs/build/development-tools/development.mdx tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** docs / developer experience
- **Depends on:** none; no active exact-path owner at planning time
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

The app-local README sends contributors to port 3000 and tells them to edit a
nonexistent `app/page.tsx`. The repository actually launches Playground through
Portless at `https://playground.tuturuuu.localhost`, with direct fallback port
3003 and source under `src/app`, so the primary onboarding path currently fails.

## Current state and exact contract

- `apps/playground/README.md` is the unmodified Create Next App template.
- `apps/playground/package.json:7-13,53-55` defines `bun dev` through Portless,
  `dev:app` on `${PORT:-3003}`, and the name `playground.tuturuuu`.
- `apps/docs/build/development-tools/development.mdx` documents the canonical
  HTTPS local URL. The editable entry is `apps/playground/src/app/page.tsx`.
- Document root `bun setup`, `bun run --cwd apps/playground dev`, canonical
  Portless URL, direct fallback command/port, the real source entry, typecheck,
  build, and repository guidance. Link to canonical development docs rather
  than duplicating environment or Supabase instructions.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/docs
instructions. Use an isolated worktree and run setup immediately; do not start
a dev server during this documentation-only task.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Retired template | `! rg -n 'localhost:3000|app/page\.tsx|npm run dev|yarn dev' apps/playground/README.md` | exit 0 |
| Canonical contract | `for p in 'bun setup' 'bun run --cwd apps/playground dev' 'playground.tuturuuu.localhost' '3003' 'src/app/page.tsx' 'type-check' 'build'; do rg -Fq -- "$p" apps/playground/README.md || exit 1; done` | exit 0; every required topic is present |
| Command existence | `node -e 'const p=require("./apps/playground/package.json"); for (const k of ["dev","dev:app","type-check","build"]) if (!p.scripts[k]) process.exit(1)'` | exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** replace `apps/playground/README.md` only. **Read-only evidence:**
the Playground manifest/source entry and canonical development docs.

**Out of scope:** source/config/manifest/dependency changes, dev-server startup,
new environment requirements, screenshots, deployment, or rewriting canonical
docs.

## Steps

1. Replace the starter template with a concise app purpose, prerequisites, root
   setup, canonical Portless start/URL, direct fallback, real source entry, and
   verification section. Use repository-relative links to canonical docs.
   **Verify:** retired-template search is empty and required-topic search passes.
2. Check every documented script against the live manifest and every local link
   against the repository. **Verify:** command-existence check exits 0.
3. Run repository, whitespace, and one-file scope gates; create a scoped docs
   commit only if all pass.

## Done criteria

- [ ] A new contributor can run and locate Playground using only accurate
      repository commands and paths.
- [ ] Portless and direct-port behavior match the live manifest.
- [ ] No source, config, manifest, dependency, or canonical docs file changed.
- [ ] Contract/repository/whitespace gates pass.

## STOP conditions

Stop on active ownership, manifest/source URL drift, need for source/config or
root-script changes, broken canonical docs link requiring broader ownership, or
any mandatory gate failing twice.
