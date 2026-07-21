# AGENTS.md — apps/backend (Rust worker)

Nearest-scope operating rules for the Rust backend. Read this before editing
`apps/backend`; root `AGENTS.md` still applies on top.

## Deployment Status

`apps/backend` is a future migration target only. It is not currently deployed
and does not serve production traffic; `apps/web` remains the live API runtime.
Treat dispatcher coverage and `migrated` manifest entries as source-readiness
signals, not evidence of live routing. Do not claim a Rust route is serving
users without an explicitly approved and independently verified cutover.

## Incremental refactor as you migrate (REQUIRED)

The backend is migrated handler-by-handler by many agents in parallel. To stop
modules from growing unbounded, **refactor large files as you touch them** —
small, continuous improvements, not a deferred big-bang cleanup.

- Treat **~400 LOC** as the point to start splitting and **700 LOC as a hard
  ceiling** (root `AGENTS.md` rule): when you ADD or significantly EDIT a handler
  module, split it the same change — extract cohesive families (types, request
  validation, response builders, HTTP/outbound calls, date/time + other pure
  helpers) into submodules under a `<module>/` directory — and never leave a file
  you touched above 700 LOC.
- Use the **file + directory** module form already in the tree: keep
  `foo.rs` as the module root and add `foo/<part>.rs` submodules declared with
  `mod <part>;` inside `foo.rs`. Examples: `contact.rs` + `contact/session.rs`
  + `contact/validation.rs` + `contact/datetime.rs`. This needs **no `lib.rs`
  change** — `mod foo;` resolves to `foo.rs`, and `foo`'s own submodules are
  private to it.
- Keep the module's existing `pub(crate)` surface identical so `lib.rs` and
  other callers are untouched; give moved helpers the tightest visibility that
  compiles (`pub(super)` for parent-only use).
- Pure code movement only — no behaviour change. Keep the in-file `#[cfg(test)]`
  tests with the code they cover (move them into the relevant submodule).

## `lib.rs` is the hot module registry + dispatcher — append, don't bulk-split

`lib.rs` is now decomposed (≈680 LOC, under the 700 ceiling): it holds the crate
module registry (`mod <handler>;`), the public types, and `pub(crate) use`
re-exports. The pieces it used to inline now live in focused submodules, all
under 700 LOC:

- `src/dispatch/` — `handle_backend_request` + one `dispatch_chunk_NN.rs` per
  chunk. **This is the route-table append target.** A new route arm goes into a
  `dispatch_chunk_NN.rs`; when a chunk fills toward 700 LOC, add a fresh
  `chunk_NN.rs` (`mod` + a `dispatch_chunk_NN(...)` call in `dispatch/mod.rs`).
  Each chunk does `use crate::*;` to reach crate-root helpers/types/modules.
- `src/dispatch/mod.rs` exposes `handle_backend_request`; `lib.rs` re-exports it
  with `pub(crate) use dispatch::handle_backend_request;`.
- `src/types.rs` (BackendConfig/Request/Response), `src/response.rs`,
  `src/runtime.rs` (body buffering + runtime parts), `src/migration.rs`
  (manifest reporting), `src/legacy_routes.rs` (route_request + retired/obsolete
  responders), `src/static_routes.rs`, `src/route_predicates.rs`,
  `src/config_env.rs`, `src/constants.rs`, `src/native.rs`,
  `src/worker_runtime.rs`. Each re-exports its surface via
  `pub(crate) use <mod>::*;` from `lib.rs`, so `use crate::*` consumers and the
  dispatch chunks resolve names unchanged.

The extraction pattern (use it for any further families): move the items into
`src/<mod>.rs`, header it with `use crate::*;` (+ any external `use serde…`),
give moved items `pub(crate)` visibility, then add `mod <mod>; pub(crate) use
<mod>::*;` to `lib.rs`. Keep cohesive groups together so struct fields can stay
`pub(crate)` only where a cross-module reader (often `src/tests.rs`) needs them.

Still **do not** bulk-restructure `lib.rs`/`dispatch/` ad hoc while batches are
appending — it collides with in-flight work. Restructure only under a
`tmp/agent-coordination/` claim in a quiet window. Adding your own `mod x;` +
route arm for a new handler is normal and fine.

The unit-test suite lives in a sibling `mod tests;` file at `src/tests.rs` (it
does `use super::*` and sees every `pub(crate)`/private item). Keep new
dispatcher-level tests there, and split `src/tests.rs` by area so no single test
file crosses the 700-LOC ceiling.

## Path-guard pitfalls (handlers run in the SHARED dispatch chain)

Every handler's `handle_*_route` is called on EVERY request and must return
`None` fast for paths it doesn't own. Because of that shared dispatch, a panic in
ONE handler's path guard crashes unrelated routes/tests, not just its own.

- **Never index path segments eagerly.** `(len == 5 && ...).then_some(segments[4])`
  evaluates `segments[4]` *before* `then_some` runs, so a shorter path panics with
  index-out-of-bounds despite the length check. Use the lazy
  `.then(|| segments[4])`, or `segments.get(4)`. (`.then_some(var)` on an
  already-bound `&str` is fine — only indexing/calls in the argument are eager.)
- Guard length before any `segments[i]`; prefer `segments.get(i)` + `?`.
- After authoring a handler, run `cargo test --lib`: a green-compile handler can
  still panic at runtime and turn dozens of unrelated tests red.
- **Match the ACTUAL legacy mount path, not an assumed `/api/v1/` prefix.** Many
  routes are mounted at `/api/workspaces/...` (no `v1`); others at
  `/api/v1/workspaces/...`. A handler that hardcodes the wrong prefix compiles
  and passes tests but silently never matches (falls through to the 404
  sentinel). The coverage probe (below) catches this — every newly-integrated
  route must show COVER, not FRESH. Take the prefix verbatim from the legacy
  route's on-disk path / the manifest `routePath`.

## Detecting which routes are already migrated (precise, not by filename)

Handler files match paths by segment index / table name, NOT by extractable
string literals, and mod naming diverges from the manifest's path-derived names.
So you CANNOT reliably tell if a route is already migrated from filenames or text
search — both over- and under-count. The ground truth is the runtime dispatcher:

- A migrated path makes `handle_backend_request` return `Some(...)` (an auth-gate
  401/403 when called with no auth). An unmigrated path falls through to
  `route_request`'s `_ => json_response(404, {"error":"not found"})` sentinel.
- To map a candidate list precisely, temporarily insert a `#[tokio::test]` into
  the `mod tests` block — now at `src/tests.rs` (it has the private `request()` /
  `RecordingOutboundClient` / `backend_config_with_contact_data()` helpers). For
  each candidate GET path (substitute dynamic `:seg`/`*seg` with a concrete value
  like `x`), call
  `handle_backend_request(&config, request("GET", concrete), &outbound).await` and
  classify: `status == 404 && body["error"] == "not found"` ⇒ FRESH, else COVER.
  Run `cargo test --lib <probe> -- --nocapture`, read the output, then REVERT the
  insertion (`git checkout -- src/tests.rs` after confirming the diff is only your
  probe — never `git checkout -- src/lib.rs`, which would wipe uncommitted chunk
  integration). Feed only the FRESH routes to a migration batch so the fleet never
  authors a duplicate handler. (Measured: of 121 filename-"unmigrated" small GETs,
  the probe found only 16 genuinely fresh.)

## Migrating ONE method of a multi-method route (GET now, mutations later)

Many routes define GET + POST/PUT/DELETE. You can migrate just the GET to Rust
and leave the mutations on Next.js — but the handler MUST return `None` (NOT
`method_not_allowed`/405) for every method it does not own, so the worker falls
through to the still-active Next.js route for those. Use
`Some(match request.method { "GET" => ..., _ => return None })`. A 405 here would
break a live mutation.

Verify with a DUAL probe (extend the coverage probe to loop methods): the
migrated method must be COVER, and each un-migrated method (POST/PUT/DELETE) must
be FRESH (the 404 `{"error":"not found"}` sentinel = fell through). If an
un-migrated method shows COVER, the handler is wrongly claiming it — fix before
commit. (Verified pattern: batch of 14 multi-method routes, all GET COVER + all
POST FRESH.)

## The dispatcher must stay chunked (stack-overflow cliff)

`handle_backend_request` dispatches by calling `dispatch_chunk_NN` sub-fns, each
holding ~40 `if let Some(response) = mod::handle(...).await { return Some(...) }`
arms and ending in `None`. DO NOT collapse them back into one giant async fn:
~292 awaited handler futures in a single async fn made the cumulative future
size overflow the debug-test thread stack (SIGABRT "has overflowed its stack")
and risks the Worker stack too. Chunking keeps only one chunk's future live per
await. When you add a handler, append its arm to the LAST chunk (or add a new
chunk once a chunk passes ~40 arms) and add the matching call in
`handle_backend_request`. Arms inside a chunk use `return Some(response);` (the
chunk returns `Option`), not `return response;`.

The eager `.then_some(segments[i])` panic (see above) RECURS in fleet-authored
handlers despite this doc — make it a mechanical integration step:
`grep -rl '.then_some(segments[' src/ | xargs perl -i -pe 's/\.then_some\((segments\[\d+\])\)/.then(|| $1)/g'`
before `cargo test --lib`.

## Verify

- `cd apps/backend && cargo check` after each extraction (fast; sub-second when
  warm). A red check from an UNRELATED untracked WIP file means another agent's
  in-flight handler doesn't compile yet — confirm your own module reports zero
  errors, and never stage `lib.rs` or files you didn't create.
- `cargo test <module>` for the moved in-file tests when the crate compiles.
- Before committing backend work, run the full gate with **`bun check:backend`**
  from the repo root (`node scripts/check-backend.js`). It mirrors
  `.github/workflows/rust-backend.yml` exactly — `cargo fmt --check`, then
  `cargo clippy --locked --all-targets --features native -- -D warnings`, then
  `cargo test --locked`, then the `wasm32-unknown-unknown` worker-target
  `cargo check`. Pass `--skip-worker` if the wasm target is not installed
  (`rustup target add wasm32-unknown-unknown` adds it). Treat clippy `-D
  warnings` and `cargo fmt` as required: a `cargo check`-clean handler can still
  fail CI on a doc-comment lint or formatting.
- Never stage another agent's uncommitted `lib.rs` edit or untracked `*.rs`;
  commit only the module files you own, path-scoped.
