---
name: tuturuuu-satellite-app-ux
description: Tuturuuu satellite app UX guidance. Use when building or revamping standalone apps such as Mail or CMS that use @tuturuuu/satellite auth, providers, i18n, workspace routes, navigation, and focused app shells.
---

# Tuturuuu Satellite App UX

## Core Workflow

Use this skill for standalone app surfaces under `apps/*` that behave like
satellite apps rather than sections inside `apps/web`.

Start with `AGENTS.md`, `git status --short`, and active coordination notes.
Then inspect the target app's existing `proxy.ts`, `i18n/routing.ts`,
providers, workspace layout, navigation, and app-session routes before designing
new UI.

## App Shell Checklist

- Use `@tuturuuu/satellite` providers, i18n helpers, constants, and app-session
  helpers where the app already follows that pattern.
- Keep auth target names consistent across proxy, verify-token, refresh, logout,
  and server session reads.
- Preserve workspace route shapes and locale handling. New dashboard routes need
  navigation aliases, icons, permissions or access gates, and empty states.
- Build the actual app workspace as the first screen. Avoid marketing-style
  landing pages for operational apps.
- Prefer a focused app shell with clear primary navigation, search/filter tools,
  and compact repeated actions over a generic dashboard card wall.
- Add strings to the owning app's English and Vietnamese bundles. If shared UI
  strings are added, update every app bundle that ships that shared surface.

## Data And Mutation Rules

- Use TanStack Query for client fetching/mutation.
- Put shared app API clients behind `packages/internal-api/src/*` when code is
  reused outside one route.
- Do not add raw client-side app API fetches.
- Keep protected data reads and writes behind server-owned APIs. Do not expose
  privileged Supabase access to satellite clients.

## Cross-App Parity

For Calendar or Finance, assume the standalone app and the `apps/web`
counterpart move together unless the user explicitly scopes an exception.

For other satellite apps, inspect whether a shared package or `apps/web`
counterpart already owns the behavior before duplicating logic in the app.

## Verification

Run focused tests for the target app first, then required repo checks:

```bash
bun i18n:add --app chat --key common.save --value en="Save" --value vi="Lưu"
bun type-check:chat
bun i18n:sort
bun i18n:check
```

Use `bun i18n:add` for satellite translation key add/remove/replace work when
possible; use `--entries` or `--entries-file` for bulk updates so every detected
locale file is updated and sorted together. Reserve manual message JSON edits
for broad prose rewrites or value-only updates. Finish with `bun check` for
TypeScript, JavaScript, messages, or repo config changes unless an unrelated
pre-existing blocker prevents it. Do not run long-running dev/build commands
unless the user explicitly asks.
