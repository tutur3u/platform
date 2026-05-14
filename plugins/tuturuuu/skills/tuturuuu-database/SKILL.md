---
name: tuturuuu-database
description: Tuturuuu Supabase and database workflow guidance. Use when Codex changes apps/database migrations, Supabase RLS, schema types, generated database types, workspace-scoped API writes, storage policies, strict text limits, reset scripts, pgTAP tests, or packages/types database aliases in the platform repo.
---

# Tuturuuu Database

## Core Workflow

Read `references/database-checklist.md` before changing schema, RLS, storage, or generated DB types.

Keep migrations additive when possible. Prepare migrations for the user to apply; do not run production push commands. Use runtime/API fallbacks when rollout order can vary across environments.

Use `normalizeWorkspaceId(wsId)` in API routes that accept workspace aliases such as `personal`. Keep workspace normalization consistent across selector, preview, and final save routes in the same flow.

If the user asks for commits, combine this skill with `$tuturuuu-commit`. Keep a
schema migration and the code that consumes it together when they are one rollout
contract; split docs-only or tooling-only follow-through only when it can be
reverted independently.

## Access And Types

- Prefer importing shared DB aliases from `@tuturuuu/types/db`.
- Add reusable row shapes to `packages/types/src/db.ts` instead of duplicating local `Pick<Database...>` aliases.
- For type-only Supabase usage, import `TypedSupabaseClient` from `@tuturuuu/supabase/types`.
- Do not hand-edit generated Supabase type files.
- Avoid generic `ReturnType<typeof createAdminClient>` aliases when concrete database inference matters.

## API And RLS Rules

- Verify workspace membership with the request-scoped client before admin-backed child-resource lookups or mutations.
- After membership is proven, keep protected child-resource validation and writes on a consistent admin-backed, workspace-scoped path when RLS would otherwise block the operation.
- Stamp actor-owned columns explicitly when writing with service-role/admin clients.
- Handle membership lookup errors as `500`; return `403` only when the lookup succeeds and no membership row exists.
- For `auth.uid()`-guarded RPCs, use the authenticated request-scoped client after permission checks instead of a service-role client.

## Verification

- Apply local migrations before typegen when schema changes need generated types.
- Run `bun sb:typegen` after schema changes once the local database reflects the migration.
- Run focused tests for affected API routes, helpers, or pgTAP coverage where available.
- Run `bun check` when TypeScript or root config changed.
- Never run `bun sb:push` or `bun sb:linkpush` unless the user explicitly requests it.
