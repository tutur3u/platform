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
  translations, navigation, active route ownership, or multiple packages.

Maintain the live Next.js API and shared contracts. Docker setup, Rust, and
TanStack Start are paused; do not refresh or validate their inactive trees. Shared client API
access belongs in `packages/internal-api`; satellite actors come from app sessions.
Use `bun i18n:add` for translation key operations when possible and sort value-only
message edits. Use `ttr` for requested task capture unless another tracker is chosen.

Schema/RLS changes use `$tuturuuu-database`; satellite shells use
`$tuturuuu-satellite-app-ux`. Use the focused commit, coordination, or sync skill
when that operation is part of the request. Do not load them for unrelated code edits.

Run focused non-build checks locally and require relevant exact-commit CI
tests, type-check, lint, and Next app builds. Do not run local builds or `bun check`. Production schema changes use the authorized gated migration workflow; never push directly from an agent checkout.

For shared rooms, cursors, collaborative editing or realtime checkpoint services,
use `$tuturuuu-realtime` and its focused implementation reference.
