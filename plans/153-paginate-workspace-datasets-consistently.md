# Plan 153: Paginate Workspace Datasets Consistently

> **Executor instructions:** Replace the silently truncated dataset collection
> with one bounded, ordered contract shared by live Web, the Rust migration
> handler, internal API consumers, and the current UI hook.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/datasets/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/datasets/route.ts' apps/backend/src/workspaces_datasets.rs apps/backend/src/dispatch apps/backend/api/openapi.yaml apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json apps/web/src/hooks/useWorkspaceDatasets.ts packages/internal-api/src tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Blocked by:** backend handler ownership, G22 route-manifest ownership, and
  the internal-api consumer boundary
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** explicit transfer of the Rust handler and generated TanStack
  migration artifacts
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

PostgREST caps responses at 1,000 rows, but both Web and Rust issue an unbounded
`select=*` with no ordering or continuation. Large workspaces silently lose
datasets; API-key callers can receive `count > data.length`; the UI treats the
single truncated array as complete and transfers every column.

## Current state

- Live Web session GET returns a bare array; API-key GET returns `{data,count}`.
  Both can be truncated without continuation.
- The registered Rust GET reproduces only the session branch and returns a bare
  array, so behavior must change in lockstep with Web.
- `useWorkspaceDatasets` performs a client raw fetch and assumes one complete
  `WorkspaceDataset[]`; no typed internal-api facade exists.
- The live implementation is still in the legacy tree behind a generated
  first-class wrapper, so substantial work must move it into `app/api`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, `$tuturuuu-ci-docs`,
`$tuturuuu-development-tooling`, and `$tuturuuu-commit`. Read root, Web, and
backend `AGENTS.md`, including runtime coverage rules. Create an exact-base
isolated worktree and run `bun setup`. Obtain exact backend/G22/internal-api
ownership transfers before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/datasets/route.test.ts'` | session/API-key boundary cases pass |
| Internal API | `bun run --cwd packages/internal-api test -- src/datasets.test.ts` | typed query/continuation contract passes |
| Rust | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_datasets` | handler parity passes |
| API wrappers | `bun web:api-routes:check` | no regenerated legacy wrapper drift |
| Migration tracking | `bun migration:tanstack:manifest` | first-class source id recorded |
| Backend contract | `bun check:backend` | route/OpenAPI ownership stays valid |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** `git mv` of the collection route to first-class Web plus a new
colocated route test; exact GET pagination only while preserving POST; Rust GET and tests; OpenAPI/route
tracking artifacts; typed internal-api dataset helper/test; current hook and
focused hook/consumer tests.

**Out of scope:** dataset detail/full/row/column routes, mutation redesign,
schema/migrations, UI redesign, API-key support in Rust unless its request
abstraction now exposes the header, unrelated dataset queries.

## Git workflow

Use `perf/paginate-workspace-datasets` and commit
`perf(datasets): paginate workspace collection`. Claim/release the commit
window; do not push.

## Steps

### Step 1: Define one bounded response contract

Choose a stable `(created_at, id)` keyset cursor and a bounded `limit` with an
explicit default/max. Define the exact response for both auth modes as
`{ items, nextCursor, total }` with `total: number` always exact. Web must use
the authorized PostgREST exact-count contract; Rust must send the same
`Prefer: count=exact` request and parse the total from `Content-Range` through
the existing outbound response-header accessor. Missing/malformed count
metadata is a 500, never a guessed page length. Select only the fields required
by current dataset list consumers. Reject malformed cursors and limits with a
stable 400; return `nextCursor: null` only when completion is proven. Preserve
no-store and authorization/error envelopes.

**Verify:** route contract tests cover empty, one page, exact boundary,
boundary+1, over 1,000 fixtures through pages, tie timestamps, invalid cursor,
max limit, session, API key, and database failure.

### Step 2: Move the live handler first-class

`git mv` only the legacy route into the existing `app/api` path; no colocated
legacy test exists. Create a new first-class `route.test.ts`, preserve POST and
generated HEAD behavior explicitly, and delete the legacy source. The dataset
collection has no current override entry: add the exact new key
`api:/api/v1/workspaces/:wsId/datasets:apps/web/src/app/api/v1/workspaces/[wsId]/datasets/route.ts`
with method-level metadata: GET remains `legacy-next`/`rust-backend` and notes
that Rust has bounded session-only parity while Web remains authoritative for
the API-key branch; POST is also `legacy-next`/`rust-backend` and notes
intentional Rust fallthrough. Do not mark GET `migrated` until both auth
branches have source parity. Regenerate the TanStack manifest so the old
legacy-source id disappears and the new first-class id inherits those method
statuses. Do not substantially rework code under `legacy-api-routes`.

**Verify:** wrapper check produces no generated replacement and the manifest
points at the first-class source.

### Step 3: Port the exact GET contract to Rust

Implement identical parameter parsing, selected projection, ordering, page
size+1 continuation, JSON fields, status codes, and cache headers. Keep
unported POST falling through with `None`. Explicitly document/test that the
Rust runtime still handles only the session branch if arbitrary API-key headers
remain unavailable; Web stays production source of truth until cutover.

**Verify:** paired TypeScript/Rust fixtures assert byte-equivalent response
shape and boundary behavior; the backend runtime coverage probe remains green.

### Step 4: Route the UI through internal-api

Add a typed internal-api list function for the new page contract. Replace the
hook's raw client fetch with that facade and either expose infinite pagination
or deliberately aggregate pages with a documented finite safety ceiling; do not
again label a partial first page complete. Preserve its public hook return shape
only if all current consumers need the complete list and the bounded aggregation
contract is proven.

**Verify:** internal-api/hook tests cover continuation, query keys, abort/error,
and a list above 1,000 without silent loss.

### Step 5: Run migration-aware gates

Run Web, internal-api, and Rust focused suites; wrapper/manifest/OpenAPI checks;
backend check; typechecks; Web production build; `bun check`; whitespace. Review
generated artifact diffs and stage only deterministic route-tracking output.

## Done criteria

- [ ] Web session and API-key GETs expose one bounded continuation contract.
- [ ] Rust session GET matches Web pagination/status/cache behavior.
- [ ] More than 1,000 datasets can be reached without silent truncation.
- [ ] The UI uses a typed internal-api boundary and handles continuation.
- [ ] The route is first-class and migration artifacts identify the new source.
- [ ] Focused, backend, build, repository, and whitespace gates pass.

## STOP conditions

Stop on exact backend/G22/internal-api ownership, caller dependence on the old
bare-array envelope without a migration path, inability to define stable
ordering, Rust request-contract incompatibility, wrapper/manifest drift,
environment build failure twice, or any required parity gate failure twice.
