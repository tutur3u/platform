# Plan 209: Cursor-Page Enhanced Workspace Members Across Web and Rust

> **Executor instructions:** Replace the unpaged, multi-query enhanced-member
> response with one stable database-backed cursor page, keep Web and prepared
> Rust behavior identical, and migrate every known in-repo consumer to the
> closed page envelope.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- apps/web/src/lib/workspace-members.ts 'apps/web/src/legacy-api-routes/workspaces/[wsId]/members/enhanced' 'apps/web/src/app/api/workspaces/[wsId]/members/enhanced' apps/web/src/components/settings/workspace/members-settings.tsx 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members' apps/web/src/components/settings/settings-dialog-native-admin-panels.tsx packages/internal-api/src/workspaces.ts packages/types/src/db.ts apps/mobile/lib/core/config/api_config.dart apps/mobile/lib/data/repositories/workspace_management_repository.dart apps/mobile/lib/features/settings/view/settings_workspace_members_page.dart apps/mobile/lib/features/settings/view/settings_workspace_roles_page.dart apps/backend/src/workspaces_members_enhanced.rs apps/backend/src/workspaces_members_enhanced apps/database/supabase/migrations apps/database/supabase/tests apps/tanstack-web/migration/route-manifest.json packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / correctness / API migration
- **Depends on:** Plans 154 and 163; G22/backend route-artifact,
  database/generated-type, Web settings, internal-api, and Mobile ownership
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

The enhanced-member endpoint reports success after unpaged PostgREST reads that
can silently stop at 1,000 rows. It then issues serial role batches and several
more unpaged enrichment/share queries before returning one PII-bearing array.
The prepared Rust handler repeats the same contract. Large workspaces can lose
members or direct board guests while callers cannot detect truncation.

## Exact public contract

- Keep `GET /api/workspaces/:wsId/members/enhanced`, `status=all|joined|invited`,
  authorization, hidden-name/email behavior, role/default-permission fields,
  creator flag, workspace profile projection, and direct-board-guest semantics.
- Add `limit` with default `100`, minimum `1`, maximum `200`, and opaque
  `cursor`. Invalid values return a sanitized `400` in Web and Rust.
- Return exactly
  `{ items: InternalApiEnhancedWorkspaceMember[], nextCursor: string | null, totalCount: number }`.
  The cursor is base64url-encoded UTF-8 JSON with the closed shape
  `{ "v": 1, "s": <source_rank>, "p": <pending_rank>, "t": <ISO timestamp or null>, "i": <stable id> }`.
  Web validates it with a strict schema and Rust validates the same fields;
  callers still treat it as opaque. The RPC accepts those decoded tuple fields
  as typed arguments rather than parsing base64 in SQL.
- Preserve ordering by materializing one canonical union with sort tuple
  `(source_rank, pending_rank, sort_created_at DESC, stable_id ASC)`: workspace
  members first (`pending=false` before `true`), then de-duplicated direct board
  guests ordered by first share time. Preserve current status behavior:
  `joined` returns joined members and no guests; `invited` returns pending
  invites plus direct guests; `all` returns all three groups.
- The live view represents email invites with `id = null`. Define
  `stable_id = coalesce(id::text, 'email:' || lower(email))`; reject an
  impossible row with neither id nor email. Use the underlying non-null source
  timestamps and normalize any legacy/null projection to PostgreSQL
  `-infinity` solely for ordering, with a focused legacy-null assertion. Encode
  that exact normalized state as cursor `t: null`; the RPC maps a null cursor
  timestamp back to `-infinity` before tuple comparison. A non-null `t` must be
  a valid ISO timestamp. Do not expose the synthetic key or normalized
  timestamp in `items`.
- Implement the union/enrichment as a private or public service-role-only RPC
  with fixed search path and exact function ACLs. It must apply the cursor and
  `limit + 1` before returning full projected rows and compute exact
  `totalCount` for the same filter. Both Web and Rust call this one boundary;
  neither recreates enrichment fan-out.
- Move the substantially changed Web implementation/test from the legacy tree
  into the existing first-class wrapper destination, remove the generated
  wrapper, and regenerate the manifest. There is no current matching
  `route-overrides.json` entry: do not invent one. Let manifest generation
  derive the first-class source while
  keeping the method `legacy-next` because Rust parity is prepared but the Web
  route remains production authority.
- Update the typed internal API and all known Web settings/native-panel and
  Mobile callers. List UIs must explicitly request subsequent pages; the native
  usage panel uses first-page `totalCount` rather than materializing all rows.
  Do not retain an undocumented array compatibility branch.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`,
`$tuturuuu-mobile-task-board`, and `$tuturuuu-commit`. Read root plus Web,
backend, Mobile, and database AGENTS files. Execute from the green Plan 154 plus
completed Plan 163 base after exact ownership transfers. Inventory every route
caller, including non-repository consumers if any; a supported external caller
that cannot accept the envelope is a STOP and requires a versioned rollout plan.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'members/enhanced|membersEnhanced\(|listEnhancedWorkspaceMembers\(|getWorkspaceMembers\(' apps packages --glob '!apps/database/supabase/migrations/**'` | every caller classified and in scope or explicitly read-only |
| Web focused | `bun --cwd apps/web vitest run 'src/app/api/workspaces/[wsId]/members/enhanced/route.test.ts' src/lib/workspace-members.test.ts 'src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/members-queries.test.ts'` | envelope, cursor, privacy, page UI, and failure matrix passes |
| Internal API | `bun --cwd packages/internal-api vitest run src/workspaces.test.ts` | typed query/response/cursor contract passes |
| Database focused | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/enhanced-workspace-members-page.sql` | >1,000, cursor, status, dedupe, privacy, ACL, and exact-count cases pass |
| Database full/typegen | `bun --cwd apps/database sb:validate:isolated && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/enhanced-workspace-members-page.sql` | full suite and generated signature pass |
| Rust focused | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_members_enhanced` | Web-equivalent envelope/status/cursor fixtures pass |
| Backend contract | `bun check:backend` | OpenAPI/handler contracts pass |
| Route artifacts | `bun web:api-routes:check && bun migration:tanstack:manifest` | no wrapper regeneration; manifest current |
| Web/Internal types | `bun run --cwd apps/web type-check && bun run --cwd packages/internal-api type-check` | exit 0 |
| Mobile | `flutter test test/features/settings/workspace_members_pagination_test.dart && flutter analyze` from `apps/mobile` | page loading and analysis pass |
| Web build | `bun run --cwd apps/web build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** add a page-specific helper (for example
`getWorkspaceMembersPage`) beside the existing full-array helper; the enhanced-
member route and its moved/created tests;
create `packages/internal-api/src/workspaces.test.ts` if no focused workspace
helper test exists; create
`apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/members-queries.test.ts`;
one set-based RPC migration and pgTAP; generated DB types; prepared Rust
handler/tests and OpenAPI only if required by the existing route contract;
internal-api types/helper/tests; Web settings queries/UI and native usage panel;
Mobile endpoint/repository/two settings pages plus new
`apps/mobile/test/features/settings/workspace_members_pagination_test.dart`;
generated manifest. Leave `apps/tanstack-web/migration/route-overrides.json`
unchanged because no matching override exists.

**Out of scope:** changing or deleting the existing full-array
`getWorkspaceMembers` helper and its external-project/external-app callers;
member mutations/invitations, external-project enhanced-member API, changing
privacy rules or permissions, Contacts CRM ownership, generic member search,
production cutover/apply, or unrelated settings redesign. The page helper may
share pure row-mapping utilities with the legacy helper, but must not change its
return type or make its callers auto-drain the new public endpoint.

## Steps

1. Freeze Web/Rust fixtures for current auth, status, privacy, role/profile, and
   guest-deduplication behavior. Complete the caller inventory and STOP on an
   unsupported external contract.
2. Add the service-role-only, fixed-search-path page RPC and pgTAP matrix. Seed
   more than 1,000 members and shares, page the whole result, and prove no
   duplicate/omission across equal timestamps and status filters.
3. Add a new Web page helper backed by the RPC; leave the current array helper
   and its classified external-project/external-app callers unchanged. Move the
   Web handler/test first-class and return the exact envelope with strict
   limit/cursor parsing. Update the prepared Rust handler to the same fixtures.
4. Add typed internal-api page support. Convert both Web member list consumers
   to page-aware queries/load-more behavior; use `totalCount` for the native
   summary. Add bilingual strings if a visible load-more/error label is new and
   run `bun i18n:sort`.
5. Update Mobile to decode the page envelope and fetch subsequent pages without
   assuming an array response; add page-boundary/retry tests for both member and
   role settings flows.
6. Regenerate route artifacts and run focused/full DB, typegen, Web, internal
   API, Rust/backend, Mobile, builds, repository, and whitespace gates.

## Done criteria

- [ ] Every response contains at most 200 complete enhanced rows plus an exact
  count and stable continuation cursor.
- [ ] More than 1,000 members/shares page without truncation, omission, or
  duplicate rows.
- [ ] Web and Rust return byte-equivalent envelopes/statuses for fixed fixtures.
- [ ] Every known Web/internal-api/Mobile caller handles the page contract.
- [ ] The changed Web handler is first-class and route artifacts are current.
- [ ] All focused/full DB, typegen, app, backend, Mobile, build, repository, and
  whitespace gates pass.

## STOP conditions

Stop on a supported external array consumer, privacy or guest-order ambiguity,
an inability to express the union without unbounded pre-materialization, Web/
Rust fixture drift, active ownership without transfer, red Plan 154 baseline,
default-stack mutation, unexpected type/manifest drift, or any mandatory gate
failing twice.
