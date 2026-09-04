# Plan 040: Allowlist Workspace Document Updates

> **Executor instructions:** Close the cross-tenant mutation boundary without
> changing the public response contract. Because this substantially reworks a
> legacy API route, replace its generated wrapper with a first-class handler,
> keep migration tracking synchronized, and preserve the Rust GET/fallthrough
> contract for the same path.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/legacy-api-routes/v1/workspaces/'[wsId]'/documents/'[documentId]' apps/web/src/app/api/v1/workspaces/'[wsId]'/documents/'[documentId]' apps/web/src/legacy-api-routes/v1/documents/'[documentId]'/route.ts apps/backend/src/workspaces_wsid_documents_documentid.rs apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on material route, schema, or migration-ownership drift.

## Status

- **Execution status:** BLOCKED — the working G22 backend lane owns the shared route override and manifest artifacts
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Tenant isolation
- **Depends on:** G22 backend migration ownership release or explicit transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The workspace-scoped PATCH passes the entire caller body to an admin-client
update. A caller with `manage_documents` in one workspace can therefore change
`ws_id`, creator, identifiers, or audit fields, moving data across tenants and
corrupting provenance.

## Current state

- The legacy route authorizes workspace membership and `manage_documents`, but
  `route.ts:63-77` parses raw JSON and calls `.update(data)` through the admin
  client.
- The predicate checks the row's old `ws_id`; it does not prevent the update
  payload from assigning another valid workspace.
- The current workspace editor sends snake-case `is_public`; the parallel
  canonical document API instead accepts camel-case `isPublic`. Preserve the
  live workspace route's `name`, `content`, and `is_public` request contract and
  map those fields explicitly rather than applying the other route's schema.
- The first-class target is currently a generated wrapper; it must be replaced,
  not overwritten by a plain `git mv`. No override exists yet, so create a new
  first-class-source override entry rather than claiming to re-key one.
- `apps/backend/src/workspaces_wsid_documents_documentid.rs` owns GET only and
  deliberately returns `None` for PATCH/DELETE so they fall through to Web.
- Root policy requires substantially reworked legacy handlers and colocated
  tests to move under `apps/web/src/app/api/**`, followed by override re-keying,
  manifest generation, `bun web:api-routes:check`, and a real Web build.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; read
`apps/backend/AGENTS.md` fully. Do not begin until
the G22 coordination note is terminal or its owner explicitly transfers the
generated migration artifacts.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/documents/[documentId]/route.test.ts'` | all cases pass |
| Wrapper check | `bun web:api-routes:check` | exit 0 |
| Manifest | `bun migration:tanstack:manifest` | exit 0; manifest is current |
| Migration check | `bun migration:tanstack:check` | exit 0 |
| Rust handler tests | `cargo test --locked workspaces_wsid_documents_documentid -- --nocapture` from `apps/backend` | GET parity and non-GET fallthrough pass |
| Backend gate | `bun check:backend` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Move the workspace document handler and its new focused test to
  `apps/web/src/app/api/v1/workspaces/[wsId]/documents/[documentId]/`.
- Update `apps/backend/src/workspaces_wsid_documents_documentid.rs` comments or
  focused tests needed to preserve GET parity and PATCH/DELETE fallthrough.
- Create the first-class-source entry in
  `apps/tanstack-web/migration/route-overrides.json` and regenerate
  `apps/tanstack-web/migration/route-manifest.json`.

Do not alter document read/delete semantics, permissions, response shapes,
public document sharing, or the parallel `/api/v1/documents/:documentId` API.

## Git workflow

- Branch: `fix/allowlist-workspace-document-updates` in an isolated worktree;
  run `bun setup` immediately.
- Conventional Commit: `fix(web): allowlist document update fields`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging and never stage coordination notes.

## Steps

### Step 1: Move the route to the first-class tree

Remove the generated wrapper, then use `git mv` for the legacy implementation
into that now-vacant first-class path. Add a colocated route test and create the
matching first-class-source override entry. Regenerate the wrapper inventory
and manifest; do not hand-edit generated output.

### Step 2: Enforce the canonical mutation schema

Add a strict workspace-route schema that accepts only the live snake-case API
fields `name`, `content`, and `is_public`. Construct a typed update containing
only provided fields. Return 400 for malformed, unknown, or empty updates and
preserve 401/403/404/success behavior. Never spread the body into a mutation.

### Step 3: Prove tenant and immutable-field safety

Tests must send `ws_id`, `creator_id`, `id`, `created_at`, and `updated_at` with
otherwise valid input and prove none reaches `.update`. Cover valid partial
updates, empty input, invalid types, unauthorized, forbidden, and not found.

### Step 4: Preserve Rust method ownership

Keep the Rust GET behavior faithful to the moved Web GET. Add/refresh the dual
method probe required by `apps/backend/AGENTS.md` so GET is handled and PATCH
and DELETE return `None` for fallback. Do not port mutations in this plan.

## Test plan

- Create the named colocated route test by modeling existing Web route mocks.
- Assert the exact object passed to `.update` for each allowed partial update.
- Assert tenant/provenance fields never reach the database and malformed or
  empty bodies return the established client-error contract.

## Done criteria

- [ ] Only the three canonical mutable fields can reach the admin update.
- [ ] Immutable and tenant fields are rejected or ignored consistently with the shared schema.
- [ ] The handler is first-class and migration tracking references its new source.
- [ ] Focused tests, route checks, manifest checks, `bun check:backend`, `bun check`, Web build, and whitespace pass.

## STOP conditions

Stop if G22 still owns the shared migration/backend artifacts, the workspace
editor no longer sends `is_public`, clients rely on arbitrary column updates,
the Rust handler no longer owns GET-only fallback, or regeneration changes
unrelated routes.

## Maintenance notes

Reviewers should reject future request-object spreading into admin mutations.
Keep its field semantics aligned with the canonical document API while
preserving the workspace endpoint's established snake-case request contract.
