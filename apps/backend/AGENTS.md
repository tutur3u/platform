# AGENTS.md — apps/backend (Rust worker)

Nearest-scope operating rules for the Rust backend. Read this before editing
`apps/backend`; root `AGENTS.md` still applies on top.

## Incremental refactor as you migrate (REQUIRED)

The backend is migrated handler-by-handler by many agents in parallel. To stop
modules from growing unbounded, **refactor large files as you touch them** —
small, continuous improvements, not a deferred big-bang cleanup.

- When you ADD or significantly EDIT a handler module and it crosses **~400
  LOC**, split it the same change: extract cohesive families (types, request
  validation, response builders, HTTP/outbound calls, date/time + other pure
  helpers) into submodules under a `<module>/` directory.
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

## `lib.rs` is the hot shared dispatcher — DO NOT bulk-split it ad hoc

`lib.rs` (~13k LOC) holds `route_request` and the `mod` + route registrations
that EVERY migration agent appends to (it changes every few minutes). Splitting
it unilaterally collides with all in-flight work. Only restructure `lib.rs`
under an explicit coordination claim in `tmp/agent-coordination/` during a quiet
window, and prefer moving self-contained helper FAMILIES (cookie/body/header
builders, security headers) into `lib/` submodules over touching the dispatcher.
Adding your own `mod x;` + route arm for a new handler is normal and fine.

## Verify

- `cd apps/backend && cargo check` after each extraction (fast; sub-second when
  warm). A red check from an UNRELATED untracked WIP file means another agent's
  in-flight handler doesn't compile yet — confirm your own module reports zero
  errors, and never stage `lib.rs` or files you didn't create.
- `cargo test <module>` for the moved in-file tests when the crate compiles.
- Never stage another agent's uncommitted `lib.rs` edit or untracked `*.rs`;
  commit only the module files you own, path-scoped.
