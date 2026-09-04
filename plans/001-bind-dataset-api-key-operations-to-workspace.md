# Plan 001: Bind Dataset API-Key Operations to Their Workspace

> **Executor instructions:** Execute only the files and contract below. Run each
> verification immediately after its step. Stop on drift or a failed expected
> result; do not broaden scope. The web build is mandatory because this plan
> moves and changes App Router handlers.

## Status

- **Execution status:** BLOCKED — shared migration artifacts remain owned by
  `tmp/agent-coordination/20260707-141449-codex-g22-time-roles-templates.md`
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Security / API / Migration
- **Depends on:** none
- **Planned at:** `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b`, 2026-08-10

Do not start while that note is `working`; this plan must update the same
`route-overrides.json` and `route-manifest.json`. Re-audit exact ownership after
the note reaches a canonical terminal state.

## Why this matters

The API-key branch validates a key for the path workspace, switches to the
service role, and then reads or mutates by dataset UUID alone. A key for tenant A
can therefore target a known dataset UUID from tenant B. PUT also passes the raw
body to `.update()`, allowing immutable fields to be assigned.

## Current evidence

At the planned commit, the legacy PUT/DELETE handler contains the equivalent of:

```ts
if (apiKey && (await validateWorkspaceApiKey(wsId, apiKey))) {
  supabase = await createAdminClient();
}
// ...
.from('workspace_datasets').update(data).eq('id', datasetId)
// ...
.from('workspace_datasets').delete().eq('id', datasetId)
```

in
`apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/datasets/[datasetId]/route.ts`.
The sibling `full/route.ts` filters the service-role row-cell view only by
`dataset_id`. `workspace_datasets` has `id`, `ws_id`, `name`, `description`,
`url`, and `created_at`; the UI form sends only optional `id`, `name`, and
`description`. `validateWorkspaceApiKey` compares the key context to the exact
path workspace ID, so this plan preserves the exact UUID contract rather than
adding alias support.

Runtime ownership is method-specific: Rust currently dispatches GET for the
`full` path from `apps/backend/src/dispatch/dispatch_chunk_01.rs`, while
`apps/backend/src/workspaces_datasets_full.rs` cannot inspect `API_KEY` and
currently returns 401 when no Supabase session exists. That Rust handler also
queries row cells by `dataset_id` without a workspace-bound parent check.

## Allowed files

- Move the two legacy route files, and any colocated tests, to their identical
  first-class paths under `apps/web/src/app/api/v1/workspaces/[wsId]/datasets/[datasetId]/`.
- Add `route.test.ts` beside each moved handler.
- Edit `apps/backend/src/workspaces_datasets_full.rs` and its sibling test module
  if extracted.
- Edit only the matching dataset entries in
  `apps/tanstack-web/migration/route-overrides.json` and the generated
  `route-manifest.json`.
- Do not edit schema, generated DB types, unrelated dataset routes, or callers.

## Preflight and drift gate

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`; read the nearest nested `AGENTS.md`. Run:

```bash
git status --short
git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- \
  'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/datasets/[datasetId]' \
  'apps/web/src/app/api/v1/workspaces/[wsId]/datasets/[datasetId]' \
  apps/backend/src/workspaces_datasets_full.rs \
  apps/backend/src/dispatch/dispatch_chunk_01.rs \
  apps/tanstack-web/migration
```

Expected: no semantic change to these handlers or dispatcher since the planned
commit. Any change is a STOP until the evidence and allowed-file list are
reconciled. Work in an isolated worktree if the shared checkout is dirty or
overlapping.

## Implementation steps

1. **Extract the Next handlers without changing their external contract.** Use
   `git mv` for both legacy routes into the corresponding first-class App Router
   paths. Keep response bodies/statuses and the session/RLS branch unchanged.

   Verify: `bun web:api-routes:check` exits 0 and reports no stale legacy wrapper.

2. **Make the API-key branch tenant-bound.** Preserve exact UUID key validation.
   For PUT and DELETE, require both `.eq('id', datasetId)` and
   `.eq('ws_id', wsId)`. For `full` GET, authorize the parent with
   `(id, ws_id)` before reading row cells; return the route's non-enumerating 404
   for a missing or foreign parent.

   Verify: focused tests for a workspace-A key targeting workspace B return 404,
   and the mocked row-cell/update/delete terminal query is not reached.

3. **Replace raw PUT assignment with a closed schema.** Accept `name` and
   optional nullable `description`; permit an optional body `id` only to verify
   equality with the path, then omit it from the update. Reject unknown fields,
   path/body ID mismatch, `ws_id`, `created_at`, and `url` with 400.

   Verify: the PUT test accepts the current form payload and proves the update
   object contains only `name` and `description`; immutable/unknown fields fail.

4. **Make Rust GET preserve the live API-key fallback.** In
   `workspaces_datasets_full.rs`, return `None` when no Supabase access token is
   available so the still-live Next handler can process `API_KEY`. For the Rust
   session path, authorize the parent dataset with both `id` and `ws_id` before
   querying row cells. Do not add arbitrary-header plumbing or claim API-key
   parity in Rust.

   Verify: Rust unit tests prove (a) no session returns `None`, (b) a foreign or
   missing parent returns the established non-enumerating response, and (c) a
   matching parent returns its cells. `cargo test --manifest-path apps/backend/Cargo.toml
   workspaces_datasets_full` exits 0.

5. **Add Next route regressions.** Cover same-workspace success for all methods,
   invalid key, foreign dataset, missing dataset, malformed JSON, strict PUT
   fields, and the existing session/RLS branch. Use synthetic IDs only.

   Verify:

   ```bash
   bun --cwd apps/web vitest run \
     'src/app/api/v1/workspaces/[wsId]/datasets/[datasetId]/route.test.ts' \
     'src/app/api/v1/workspaces/[wsId]/datasets/[datasetId]/full/route.test.ts'
   ```

   Expected: exit 0; all tenant-boundary and strict-body cases pass.

6. **Refresh migration bookkeeping.** Change only the two affected override IDs
   whose `sourceFile` moved, then regenerate the manifest.

   Verify: `bun migration:tanstack:manifest` and
   `bun web:api-routes:check` both exit 0; the generated diff contains only the
   two dataset routes.

7. **Run repository gates.** Run `bun check`,
   `bun run --cwd apps/web build`, and `git diff --check`. Expected: both Bun
   commands exit 0 and the whitespace check prints nothing.

## Done criteria

- [ ] Service-role access never authorizes a dataset by UUID alone.
- [ ] PUT updates only `name` and `description` and cannot change identity,
  tenant, URL, or creation metadata.
- [ ] Rust session GET checks the parent tenant and sessionless requests fall
  through to Next for live API-key compatibility.
- [ ] Focused Next/Rust tests, wrapper check, manifest generation, `bun check`,
  the Web build, and `git diff --check` pass.
- [ ] `git status --short` contains only allowed implementation paths.

## STOP conditions

Stop if the live UI now updates `url` through this route, exact UUID API-key
validation has changed, the Rust dispatcher no longer owns GET, tenant ownership
requires a schema change, or a required fix needs a file outside the allowed
list. Update this plan and index before continuing.
