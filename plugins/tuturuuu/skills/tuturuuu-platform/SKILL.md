---
name: tuturuuu-platform
description: Tuturuuu platform monorepo workflow guidance. Use when Codex works in the tutur3u/platform repo or a local Tuturuuu platform checkout, especially for apps/web Next.js changes, packages/* shared code, apps/database Supabase migrations, apps/docs documentation, translations, navigation, TanStack Query data fetching, repo verification, or Conventional Commit/branch follow-through.
---

# Tuturuuu Platform

## Core Workflow

Start by reading the nearest `AGENTS.md` instructions and any task-local docs before editing. Treat those instructions as authoritative for this checkout.

Run `git status --short` before edits. If dirty or untracked files already
exist, assume they belong to the user or another agent unless local evidence says
otherwise. For overlapping or long-running work, use
`$tuturuuu-agent-coordination` and `tmp/agent-coordination/` notes before
touching shared files.

Map the request to the smallest owning surface:

- `apps/web`: Next.js App Router platform UI and API routes.
- `apps/mobile`: Flutter mobile app.
- `apps/database`: Supabase migrations, config, reset scripts, and pgTAP.
- `apps/docs`: Mintlify docs and team-facing operational guidance.
- `packages/*`: shared UI, types, internal API clients, auth, Supabase helpers, and utilities.

Prefer existing patterns over new abstractions. Search with `rg` before introducing new APIs, types, routes, or copy. If a user-facing change adds strings, update both English and Vietnamese translations in the relevant message files.

## Hard Rules

- Do not run `bun dev`, `bun run build`, `bun build`, `bun sb:push`, or `bun sb:linkpush` unless the user explicitly requests it.
- Do not manually edit `package.json` to add dependencies. Use the package manager command for the owning workspace.
- Do not use native browser dialogs, hard-coded Tailwind color classes, emojis in UI code, client-side raw `fetch('/api/...')`, or `useEffect` for data fetching.
- Use TanStack Query for client fetching and mutation. Put shared app API access behind `packages/internal-api/src/*`.
- For schema changes, apply local migrations before typegen when possible, then run `bun sb:typegen`. Prefer DB types from `@tuturuuu/types/db`.
- For route additions, update the relevant `navigation.tsx` aliases, children, icons, and permissions.
- For docs-worthy operational or architectural changes, update `apps/docs` in the same session and add new pages to `apps/docs/docs.json`.

## Implementation Notes

Read `references/platform-checklist.md` for the compact checklist before making code changes. Use it to catch translation, navigation, docs, and verification follow-through that are easy to miss.

Read `references/platform-patterns.md` when the work touches broad `apps/web`,
shared UI, API boundaries, translations/navigation, or dense admin UX patterns
that used to live in the root operating manual.

Use the more focused plugin skills when they match the task:

- `$tuturuuu-database` for Supabase schema, RLS, API write, storage, or generated type changes.
- `$tuturuuu-ci-docs` for workflow files, validators, docs pages, and docs navigation.
- `$tuturuuu-cli` for installing, using, debugging, or publishing the native `ttr` CLI and browser/copy-token login flows.
- `$tuturuuu-commit` for explicit commit requests, scoped staging, atomic
  Conventional Commits, commit-and-push follow-through, and commit reporting.
- `$tuturuuu-agent-coordination` for dirty/shared worktrees, active ownership
  notes, archived context, overlapping edits, handoffs, and path-scoped staging
  safety.
- `$tuturuuu-development-tooling` for Codex plugin, skill, validation, docs, scripts, and durable agent workflow improvements.
- `$tuturuuu-web-release` for `apps/web` release metadata, version badge,
  `TUTURUUU_PLATFORM_VERSION`, or blue/green release snapshot fallback work.
- `$tuturuuu-mobile-task-board` for Flutter task-board date, routing, assignee, detail, or version bump work.
- `$tuturuuu-review-comments` for fetching, fixing, resolving, and reporting unresolved GitHub PR review threads.

Use `$tuturuuu-agent-coordination` when the immediate work depends on shared
worktree ownership or overlap handling. Use `$tuturuuu-development-tooling` when
the durable change is about plugin behavior, skill text, validation scripts,
docs runbooks, or repo automation.

If the user asks to add, create, track, or split a Tuturuuu task while working in
this repo, route to `$tuturuuu-cli` and use `ttr` as the source of truth instead
of local notes or GitHub issues, unless the user explicitly asks for those
artifacts.

For web dashboard surfaces, default to thin server gates plus client shells backed by TanStack Query, `@tuturuuu/internal-api`, and `nuqs` when the UI needs search, sorting, pagination, explorer navigation, or frequent mutation.

For protected or authenticated app CRUD from client/shared UI code, add or extend API routes and internal-api helpers instead of reading Supabase directly from client components.

For shared data shapes reused beyond one callback, export them from `packages/types/src/db.ts` and consume them through `@tuturuuu/types`.

When a session reveals durable workflow knowledge, make an incremental
improvement to the relevant Tuturuuu tooling surface when practical: plugin
skill text, `apps/docs`, validation scripts, focused tests, or helper scripts.
Keep the improvement small and tied to the task.

When the user asks to commit, treat the commit as part of the deliverable. Use
`$tuturuuu-commit`, split commits by product domain or independently revertible
scope, and stage only paths intentionally changed in this session.

## Verification

Scope verification to the files and risk first, then follow repo requirements:

- Run formatters required for touched files before final checks.
- If TypeScript, JavaScript, or root scripts/config changed, finish with `bun check`.
- If messages changed, run `bun i18n:sort` before `bun check`.
- If Flutter localization ARB keys changed, run `flutter gen-l10n` before Flutter analysis or tests.
- If mobile Flutter tests collide on `build/unit_test_assets`, rerun the focused tests sequentially.

When the user asks for review, lead with findings and exact file/line references. When no issues are found, say that clearly and mention residual test gaps.
