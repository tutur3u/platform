# Plan 050: Authorize Workspace AI Prompt Mutations

> **Executor instructions:** Close the prompt object-level authorization and
> mass-assignment gap in both the live API and database policy. Do not widen the
> accepted update contract or claim Rust ownership.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/ai/prompts/[promptId]/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/ai/prompts/[promptId]' apps/database/supabase/migrations packages/types/src/supabase.ts apps/tanstack-web/migration`
> Stop if another lane moved the route, changed `workspace_ai_prompts`, or still
> owns the generated migration artifacts.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / Tenant authorization
- **Depends on:** G22 route-artifact ownership release or explicit transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The item route ignores `wsId`, trusts RLS that does not check membership, and
passes an arbitrary JSON object into `update`. Any authenticated user who learns
a prompt UUID can read, rewrite, move, or delete another workspace's prompt.

## Current state

- The legacy GET, PUT, and DELETE filter only by prompt ID; the generated
  first-class file merely wraps that implementation.
- PUT accepts every update column, including `ws_id`, `creator_id`, `id`, and
  `created_at`.
- The original all-commands policy only checks that the referenced workspace
  exists. It neither verifies membership nor has an effective `WITH CHECK`.
- `manage_ai_prompts` is the current dedicated permission for shared prompt
  management.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Work in an isolated worktree and coordinate
ownership of `route-overrides.json` and `route-manifest.json` before editing.
Inspect the nearest nested instructions and confirm the Rust backend does not
own this path.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/ai/prompts/[promptId]/route.test.ts'` | auth, permission, tenant, and schema cases pass |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | membership and write-policy cases pass |
| Local migration | `bun sb:reset` | migration applies locally |
| Generated types | `bun sb:typegen` | only schema-derived changes |
| Wrapper guard | `bun web:api-routes:check` | no generated-wrapper drift |
| Migration tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | route ownership stays accurate |
| Backend guard | `bun check:backend` | migration target remains consistent |
| Repository gate | `bun check` | exit 0 |
| Real app compile | `bun run build:web` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Move the legacy handler and colocated/new focused test to the first-class Web
  API path, deleting the generated wrapper source relationship.
- Add one additive Supabase migration replacing the permissive policy.
- `apps/database/supabase/tests/workspace-ai-prompts-authorization.sql`
- Update generated database types only through `bun sb:typegen`.
- Update the exact TanStack override key and generated manifest required by the
  first-class move.

## Git workflow

- Branch: `fix/authorize-workspace-ai-prompts` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ai): authorize workspace prompt mutations`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Establish the actor and workspace boundary

Normalize the route workspace, require an authenticated actor, and resolve
permissions for that actor and workspace. Require `manage_ai_prompts` for PUT
and DELETE and `use_ai_studio` for GET; do not substitute ordinary membership
for either capability.

### Step 2: Bind every operation to both identifiers

Query with both `id = promptId` and `ws_id = normalizedWsId`. Return the
repository's stable 404 for an absent or foreign object, and preserve distinct
401/403 behavior for unauthenticated and unauthorized actors.

### Step 3: Allowlist mutable fields

Parse PUT with a strict schema containing only `name`, `input`, `output`, and
`model`, with existing product limits made explicit. Reject empty updates,
unknown keys, invalid JSON, and attempts to set tenant/provenance columns.

### Step 4: Repair the database backstop

Replace the existing policy with explicit membership/permission predicates for
SELECT, UPDATE, and DELETE. Add an UPDATE `WITH CHECK` that prevents tenant
movement and prove non-members cannot access guessed IDs. Do not rely on the
route alone as the permanent boundary.

### Step 5: Complete first-class migration bookkeeping

Move the implementation out of `legacy-api-routes`, update the override key
whose identity embeds the source file, regenerate the manifest, and verify the
backend continues to fall through because no Rust mutation owner was added.

## Test plan

Cover anonymous, member without permission, authorized manager, foreign
workspace prompt, missing prompt, malformed/unknown fields, tenant-field
mass-assignment, and successful read/update/delete. Add database tests for
member and non-member SELECT plus UPDATE `WITH CHECK` behavior.

## Done criteria

- [ ] Prompt IDs never bypass workspace and permission authorization.
- [ ] PUT cannot mutate identity, tenant, creator, or timestamp columns.
- [ ] RLS independently enforces the same tenant boundary.
- [ ] The route is first-class and migration metadata is regenerated.
- [ ] Focused tests, database checks, backend guard, repository gate, and Web build pass.

## STOP conditions

Stop while G22 owns aggregate route artifacts or if historical prompts have a
null/invalid workspace requiring product disposition.

## Maintenance notes

Treat route workspace plus object ID as the canonical compound identity for
workspace resources, even when UUIDs are globally unique.
