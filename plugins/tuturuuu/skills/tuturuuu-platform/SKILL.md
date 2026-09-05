---
name: tuturuuu-platform
description: "Implement Tuturuuu web routes and shared UI, including translations, navigation, and internal API access."
---

# Tuturuuu Platform

Use for web/API/shared UI implementation. Apply the root and nearest app rules;
load only the reference section needed by the affected surface.

- `references/platform-patterns.md`: Cache Components, satellite actors, shared API
  boundaries, dashboard interaction, translations, and navigation.
- `references/repository-workflows.md`: app ownership, settings shells, package
  commands, task capture, and coordination metadata.
- `references/platform-checklist.md`: follow-through for a substantial change across
  translations, navigation, API migration tracking, or multiple packages.

Preserve the live Next API and Rust/TanStack migration parity. Shared client API
access belongs in `packages/internal-api`; satellite actors come from app sessions.
Use `bun i18n:add` for translation key operations when possible and sort value-only
message edits. Use `ttr` for requested task capture unless another tracker is chosen.

Schema/RLS changes use `$tuturuuu-database`; satellite shells use
`$tuturuuu-satellite-app-ux`. Use the focused commit, coordination, or sync skill
when that operation is part of the request. Do not load them for unrelated code edits.

Run focused checks, then `bun check` for TS/JS or root-script/config changes.
Build the affected app for route/page/dependency changes because `bun check` does
not compile Next routes. Production schema pushes remain user-only.
