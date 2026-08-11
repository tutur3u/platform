# Plan 092: Allowlist Workspace Secret Mutations

> **Executor instructions:** Accept only bounded `name` and `value` fields and
> move the substantially edited legacy handlers to first-class routes. Do not
> weaken managed-cron authorization.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/workspaces/[wsId]/secrets' 'apps/web/src/app/api/workspaces/[wsId]/secrets' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on secret-route or migration-artifact drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** security
- **Depends on:** G22 migration-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The routes use TypeScript annotations as though they were runtime validation,
then spread request JSON into privileged inserts/updates. A platform admin gets
an admin client, so a crafted PUT can rewrite `id`, `created_at`, or `ws_id` and
move/corrupt a secret outside the route workspace.

## Current state

- collection `route.ts:42-77` parses unvalidated JSON and inserts `{ ...data,
  ws_id: resolvedWsId }`.
- item `route.ts:15-77` parses the same unvalidated shape and calls
  `.update(data)` after a workspace-scoped lookup.
- `access.ts:34-53` allows target-workspace secret managers or root platform
  admins; the latter receive `createAdminClient()`.
- `packages/types/src/supabase.ts:37375+` exposes update fields including
  `created_at`, `id`, and `ws_id`.
- focused tests cover happy-path tenant predicates and managed-cron denial but
  not extra privileged fields.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. This plan is
blocked while `20260707-141449-codex-g22-time-roles-templates.md` owns
`route-overrides.json` and `route-manifest.json`; do not work around that owner.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/web vitest run 'src/app/api/workspaces/[wsId]/secrets/route.test.ts' 'src/app/api/workspaces/[wsId]/secrets/[secretId]/route.test.ts'` | strict payload tests pass |
| Wrapper check | `bun web:api-routes:check` | no wrapper drift |
| Manifest | `bun migration:tanstack:manifest` | first-class source IDs recorded |
| Migration check | `bun migration:tanstack:check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- collision-safe replacement of both generated wrappers by the two legacy
  handlers and their colocated tests under `apps/web/src/app/api/**`
- the shared `access.ts` moved with the collection route
- exact route override IDs and regenerated manifest
- `plans/README.md` only for status

Do not change GET response fields, permission meanings, secret encryption, or
managed-cron employee policy.

## Git workflow

After ownership transfer, use branch `fix/workspace-secret-payloads` in an
isolated worktree and run `bun setup`. Commit `fix(web): allowlist workspace
secret mutations`. Claim the commit window before staging.

## Steps

### Step 1: Add failing payload tests

For POST and PUT, prove malformed JSON returns 400; missing/empty/oversized
name/value and unknown `id`, `created_at`, or `ws_id` fields return 400 before
any insert/update. Preserve valid partial PUT semantics only if the current UI
uses them; otherwise require both fields and freeze that decision in tests.

### Step 2: Move to first-class routes

First `git rm` each generated wrapper under `apps/web/src/app/api/.../secrets`.
Then `git mv` the legacy handlers, tests, and `access.ts` into the vacant
first-class tree. Confirm no legacy implementation remains.

### Step 3: Validate and allowlist

Use strict Zod schemas with repository length constants. Construct insert and
update objects explicitly from parsed `name`/`value`; never spread request
JSON. Keep terminal mutations filtered by both ID and resolved workspace and
preserve existing managed-cron checks against the validated name.

### Step 4: Refresh migration tracking and verify

Re-key the two override IDs from legacy to first-class source paths, regenerate
the manifest, run wrapper/migration checks, focused tests, Web build, `bun
check`, and whitespace.

## Done criteria

- [ ] POST/PUT persist only validated `name` and `value`.
- [ ] Privileged fields are rejected before admin mutation.
- [ ] Managed-cron and tenant predicates remain covered.
- [ ] Both handlers/tests are first-class; no legacy sources/wrappers remain.
- [ ] Route tracking, focused tests, Web build, and repository gates pass.

## STOP conditions

Stop until G22 transfers the artifacts; also stop if a caller requires another
field, the existing wrappers are no longer generated, a Rust owner appears, or
a gate fails twice.

## Maintenance notes

Compile-time request types never validate JSON. Keep schemas strict at every
admin-client mutation boundary.
