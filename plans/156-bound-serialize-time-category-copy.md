# Plan 156: Bound and Serialize Time-Category Copying

> **Executor instructions:** Keep Track and live Web behavior in parity while
> bounding category selection and making case-insensitive target deduplication
> atomic.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/categories/copy/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/categories/copy/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/categories/copy/route.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** Plan 154; G22 route-manifest transfer plus
  migration/generated-type ownership transfer; coordinate the Track
  request/session database lane
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Both route copies accept an unbounded ID array, ignore target-category query
errors, read the entire target collection behind PostgREST's 1,000-row cap, and
perform check-then-insert deduplication without a database invariant. Large or
overlapping requests can silently omit selected sources or create duplicate
category names.

## Current state

- Track and Web contain byte-identical POST handlers; Web is still the live
  platform source and is tracked as a legacy route in TanStack migration data.
- Source lookup passes every caller ID into `.in(...)` without UUID, duplicate,
  or count bounds.
- Target lookup selects all names and discards its `error`; truncated/error
  results are treated as authoritative.
- `time_tracking_categories` has only an ID primary key and no workspace/name
  uniqueness invariant.
- No focused test covers either route copy.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root, Web, Track,
backend, and database `AGENTS.md`. Obtain every named transfer, create an
exact-base isolated worktree atop Plan 151, and run `bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Track route | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/categories/copy/route.test.ts'` | bounded/auth/error contract passes |
| Web route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/categories/copy/route.test.ts'` | byte-equivalent contract passes |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/time-tracking-category-copy.sql` | duplicate audit/invariant/concurrency cases pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | full exact-base suite passes after Plan 154 |
| Wrappers | `bun web:api-routes:check` | first-class route has no generated-wrapper drift |
| Migration tracking | `bun migration:tanstack:manifest` | new first-class source identity is recorded |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | production build exits 0 |
| Web build | `bun run --cwd apps/web build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** first-class Web move and colocated test; Track route/test; one
shared bounded request schema or identical schema contract; one uniquely named
atomic copy RPC/constraint migration and pgTAP; generated types; required
TanStack route artifacts.

**Out of scope:** category CRUD redesign, session/request category containment
from Plan 149, UI redesign, Rust port creation where none exists, copying more
than the explicit bounded request, or silently deleting existing duplicates.

## Git workflow

After dependencies use `perf/bound-time-category-copy` and commit
`fix(track): bound time category copying`. Claim/release the commit window; do
not push or apply production migrations.

## Steps

1. Add matching route fixtures for cookie/app-session actors, target/source
   membership failures, malformed/duplicate UUIDs, empty and oversized input,
   missing source rows, target lookup error, partial duplicates, insert failure,
   and stable success counts. Set one documented maximum no greater than 200.
2. Move the Web implementation and its new test first-class. Share only a
   server-safe request/response schema; preserve both hosts' auth adapters and
   the existing 200/400/403/404/500 envelopes unless the atomic RPC needs a
   documented 409 conflict.
3. Run a read-only migration assertion for duplicate `(ws_id, lower(name))`
   groups and STOP with operator disposition if any exist. After that assertion,
   add a database-enforced case-insensitive invariant and a service-role-only RPC
   with fixed `search_path` and explicit revoke/grant hardening. The route passes
   its server-resolved actor ID; the RPC revalidates that actor's membership in
   both normalized workspaces under the same transaction, locks/serializes the
   target workspace, validates source ownership, and inserts/skips atomically.
   Anonymous/authenticated database callers cannot invoke the function.
4. Have both routes pass normalized source/target workspace IDs and bounded
   unique category IDs to the same RPC through each app's server-side
   `createAdminClient()`, only after the completed
   actor and both-workspace membership checks. Return created/skipped rows from
   the transaction; fail closed on admin-client creation and every query/RPC
   error. Never grant the RPC to `authenticated` merely to reuse
   `auth.supabase`.
5. Add two-connection pgTAP coverage proving overlapping copies produce one
   target name, plus direct ordinary-caller denial, spoofed-actor denial,
   PostgREST-cap, and duplicate-audit cases. Regenerate types
   only after the disposable stack reflects the migration, then run parity and
   build gates.

## Done criteria

- [ ] Both route copies enforce the same bounded authenticated contract.
- [ ] No ignored lookup error or unbounded target materialization remains.
- [ ] Database concurrency guarantees one case-insensitive name per workspace.
- [ ] Existing duplicates are explicitly dispositioned before enforcement.
- [ ] Web first-class/TanStack tracking and all mandatory gates pass.

## STOP conditions

Stop on ownership, any existing duplicate without operator disposition, an RPC
that is callable/spoofable by ordinary database actors, inability to run a real
two-connection test, Plan 154 still red, generated-type/manifest drift outside
scope, or any gate failing twice.
