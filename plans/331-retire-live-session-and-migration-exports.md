# Plan 331: Apply Accepted Removal to Live Session and Migration Exports

> **Executor instructions:** Replace the two live credential/data-export
> handlers with first-class terminal responses. Do not preserve, log, test with,
> or snapshot any cookie, session, API-key, or exported workspace data.
>
> **Drift check (run first):**
> `git diff --stat f8fa36af4b..HEAD -- apps/web/src/legacy-api-routes/auth/me/session apps/web/src/app/api/auth/me/session apps/web/src/legacy-api-routes/v2/workspaces/'[wsId]'/migrate/'[module]' apps/web/src/app/api/v2/workspaces/'[wsId]'/migrate/'[module]' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json apps/backend/src/constants.rs apps/backend/src/legacy_routes.rs apps/backend/src/route_predicates.rs apps/backend/src/tests/g15.rs apps/backend/api/openapi.yaml tmp/agent-coordination`
> Stop on either live contract, accepted-removal entry, Rust terminal response,
> OpenAPI description, or coordinator ownership drift.

## Status

- **Execution status:** BLOCKED — aggregate migration-artifact and backend transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / migration / tests
- **Depends on:** named aggregate coordinator resolution of every nonterminal override/manifest claim, plus backend transfer
- **Planned at:** commit `f8fa36af4b`, 2026-08-12

## Why this matters

The live Web session endpoint converts HttpOnly Supabase cookies and the full
session into JavaScript-readable JSON. The live workspace migration endpoint
lets any workspace API key reach broad service-role exports without a named
permission. Migration metadata already accepts both surfaces for removal, and
Rust already returns a terminal response for the migration export, but Web is
the production source of truth and still exposes the unsafe behavior.

## Current state and exact contract

- `apps/web/src/legacy-api-routes/auth/me/session/route.ts:5-21` reads every
  `sb-*` cookie value and `auth.getSession()`, then returns both. Its generated
  wrapper at `apps/web/src/app/api/auth/me/session/route.ts:1-7` exports GET and
  HEAD. No in-repository caller references `/api/auth/me/session`.
- `apps/web/src/legacy-api-routes/v2/workspaces/[wsId]/migrate/[module]/route.ts`
  is 1,107 lines. Lines 11-80 enumerate sensitive workspace exports; lines
  305-345 authorize only API-key/workspace equality before creating the admin
  client; its `withApiAuth` options require no capability.
- `apps/tanstack-web/migration/route-overrides.json` records both exact legacy
  source IDs as `accepted-removal`. The session note forbids raw session export;
  the migration note requires terminal `410 MIGRATION_DISABLED`.
- `apps/backend/src/constants.rs` defines the exact migration message:
  `Workspace API-key migration export is no longer available. Use maintained database exports or local backfill scripts instead.`
  `apps/backend/src/legacy_routes.rs` and `apps/backend/src/tests/g15.rs` freeze
  GET as 410 and currently treats HEAD as unsupported. Because Web's generated
  wrapper already supplies bodyless HEAD, update the prepared Rust handler in
  the same change: allow `GET, HEAD`; return the same 410 headers/status with
  `body_empty = true` for HEAD; keep every other method at 405 with
  `Allow: GET, HEAD`. Add the matching OpenAPI `head` operation.
- Substantially changed Web handlers must be first-class. Delete the legacy
  implementations, move the existing migration test first-class, create the
  session test first-class, update both override IDs/source files, and regenerate
  the manifest. Do not edit generated wrappers in place.
- Freeze Web GET responses as follows:
  - session: status 410, `Cache-Control: no-store`, JSON
    `{ "error": "SESSION_EXPORT_DISABLED", "message": "Session export is no longer available." }`;
  - migration: status 410, JSON
    `{ "error": "MIGRATION_DISABLED", "message": <the exact Rust constant above> }`.
  Explicit HEAD handlers return the same status/headers and an empty body. Export
  no other methods; preserve framework 405 behavior for unsupported methods.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n -F '/api/auth/me/session' . --glob '!plans/**' --glob '!apps/docs/**' --glob '!apps/tanstack-web/migration/**'` | only the two route tests/implementations being changed, or no matches; stop on a supported caller |
| Web tests | `bun --cwd apps/web vitest run 'src/app/api/auth/me/session/route.test.ts' 'src/app/api/v2/workspaces/[wsId]/migrate/[module]/route.test.ts'` | GET/HEAD terminal, no-dependency, and method-source contracts pass |
| Ownership inventory | `rg -n -l 'apps/tanstack-web/migration/route-(overrides|manifest)\.json' tmp/agent-coordination/*.md` | every nonterminal claim is listed and the named aggregate coordinator has recorded exact-key/file resolution; stop otherwise |
| Rust contract | `(cd apps/backend && cargo test --lib retired_workspace_data_migration)` | GET/HEAD 410 and unsupported-method 405 parity tests pass |
| Backend/OpenAPI | `bun check:backend && node --test scripts/backend-openapi-migration-contract.test.js` | Rust and OpenAPI contracts are current |
| Route artifacts | `bun web:api-routes:check && bun migration:tanstack:manifest && bun migration:tanstack:check` | no legacy wrappers regenerate; both manifest source IDs are first-class and accepted-removal remains |
| Secret/data absence | `rg -n 'cookies\(|getSession\(|createDynamicAdminClient|withApiAuth|sb-' apps/web/src/app/api/auth/me/session apps/web/src/app/api/v2/workspaces/'[wsId]'/migrate/'[module]' --glob '!*.test.ts'` | no matches |
| Web | `bun --cwd apps/web run type-check && bun --cwd apps/web run build` | typecheck and production build pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only the two Web route trees/tests, two migration artifacts, named Rust/OpenAPI files, and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Treat all credential and export values as prohibited test/log content. Use
  only synthetic markers and assert the old dependencies are never invoked.

## Scope

**In scope:** delete both legacy route implementations and the legacy migration
test; replace both generated wrappers with first-class route handlers; create or
move colocated first-class tests; update the two exact source-key entries in
`route-overrides.json`; regenerate `route-manifest.json`; plan status.

Also in scope for the already-owned Rust migration endpoint:
`apps/backend/src/legacy_routes.rs`, `apps/backend/src/route_predicates.rs`,
`apps/backend/src/tests/g15.rs`, and `apps/backend/api/openapi.yaml`.

**Out of scope:** changing the Rust migration message/status or any non-HEAD
terminal semantics; changing docs; retaining any debug/session/export field;
adding a replacement export permission; database
queries, migrations, RLS, API-key format, auth middleware, supported maintained
export tools, or unrelated aggregate route artifacts.

## Git workflow

- After exact transfer, use branch `fix/retire-live-session-migration-exports`
  in an isolated worktree and run `bun setup` immediately.
- Commit: `fix(web): retire unsafe session and migration exports`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Freeze both terminal contracts first-class

Move the migration test to the first-class route directory and replace its
module-enumeration assertions with the exact terminal matrix. Add the session
route test. Cover GET JSON/status/headers, HEAD status/headers/empty body, no
cookie/session/admin/API-auth construction, and no exported mutation method.
Use synthetic requests only; never construct an auth cookie or API key.

Replace each generated wrapper with the small first-class GET/HEAD handler and
delete both legacy implementations. The migration message must reuse a local
constant whose text exactly matches the Rust constant; do not import backend
source into Web.

**Verify:** Web tests and Secret/data absence pass.

### Step 2: Reconcile migration ownership IDs

Before editing aggregates, run Ownership inventory. The named coordinator must
resolve every nonterminal broad claim, including at least the current G22,
Finance/Inventory, and Inventory revenue-bundles notes; a transfer from only one
note is insufficient.

Change only the two override keys/source IDs from their legacy source paths to
the corresponding first-class route paths. Preserve `accepted-removal`, target
owner, and explanatory notes. Run the route-wrapper check and manifest generator;
inspect the generated diff to prove both route paths remain registered and no
unrelated ownership changed.

**Verify:** Route artifacts passes and the diff contains exactly the intended IDs.

### Step 3: Align the prepared Rust HEAD contract

Extend `retired_workspace_data_migration_route` for the v2 export to advertise
`GET, HEAD`. In the dispatcher, return the normal terminal JSON for GET and a
copy with an empty body for HEAD; do not make encryption/storage HEAD-capable.
Update `g15.rs` with the exact bodyless HEAD 410 and the new unsupported-method
`Allow: GET, HEAD` assertion. Add an OpenAPI `head` operation with the same 410
schema/description and no response body content.

**Verify:** Rust contract and Backend/OpenAPI pass.

### Step 4: Prove cross-runtime and repository health

Run Rust terminal tests, Web tests/typecheck/build, migration
check, `bun check`, scope, and whitespace gates. Do not edit Rust to make Web
parity pass; any mismatch is a STOP condition for review.

## Test plan

- Session GET/HEAD: exact 410 contract, no-store, empty HEAD, no auth/cookie read.
- Migration GET/HEAD: every former module name and an unknown name receives the
  same exact 410 before API-key/admin work; HEAD is bodyless.
- Source/import contract: neither first-class route imports old data dependencies
  or exports mutation methods.
- Rust GET and bodyless HEAD return 410; other methods return 405 with
  `Allow: GET, HEAD`; OpenAPI advertises both terminal methods.

## Done criteria

- [ ] Live Web can no longer serialize Supabase cookies/session or workspace export data.
- [ ] Both first-class routes return their exact terminal GET/HEAD contracts before dependencies.
- [ ] Legacy implementations/tests are gone and wrapper generation does not recreate them.
- [ ] Both accepted-removal entries and manifest IDs name the first-class sources.
- [ ] Focused Web/Rust tests, backend/OpenAPI and artifact gates, Web typecheck/build, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop unless the named aggregate coordinator resolves every active claim on the
override/manifest and the backend path transfers; stop if a real
supported session/export caller appears; Rust/OpenAPI no longer uses the exact
migration contract; a generator tries to restore a legacy wrapper; the fix
would retain or log credential/export data; unrelated migration entries change;
or a required gate fails twice.

## Maintenance notes

Any future workspace export must be a new reviewed, field-bounded, auditable
contract with explicit permission. Never resurrect a generic raw session or
service-role table-export endpoint for compatibility.
