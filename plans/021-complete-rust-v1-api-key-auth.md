# Plan 021: Complete Rust v1 Workspace API-Key Authentication

> **Executor instructions:** Make both registered Rust v1 workspace GET
> handlers authenticate real workspace API keys using the crate's existing
> scrypt implementation. Do not change live Next.js ownership.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/backend/src/workspaces_2.rs apps/backend/src/workspaces_deleted.rs apps/backend/src/workspaces_3.rs apps/backend/src/storage_analytics.rs apps/backend/src/storage_download_path.rs apps/backend/src/storage_list apps/backend/src/dispatch apps/tanstack-web/migration/route-manifest.json`
> Stop on auth-helper, dispatcher, or ownership drift.

## Status

- **Execution status:** BLOCKED — nonterminal backend migration handoffs own
  the Rust route-porting surface
- **Priority:** P1
- **Effort:** S
- **Risk:** MED
- **Category:** Migration correctness / Authentication
- **Depends on:** backend migration ownership transfer or terminal handoff
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Two registered Rust handlers claim v1 workspace GET routes but deliberately
reject every valid API key because their hash verifier always returns `false`.
The capability already exists elsewhere in the same crate. Promoting either
handler would turn valid SDK/CLI calls into 401 responses, while a superficial
route-coverage probe could mistake the non-fallthrough response for parity.

## Current state

- `apps/backend/src/workspaces_2.rs:66-76` handles
  `GET /api/v1/workspaces/:wsId`; lines 219-243 contain an unconditional-false
  `validate_api_key_hash` stub.
- `apps/backend/src/workspaces_deleted.rs:125-136` handles the deleted-items
  GET; lines 557-581 duplicate the same stub.
- `apps/backend/src/workspaces_3.rs:225-247` has a working verifier using
  scrypt, hex decoding, and constant-time comparison. Equivalent complete
  implementations also exist in storage modules.
- The route manifest still labels both v1 endpoints `legacy-next`; Web remains
  live, so this is source-readiness debt rather than a production claim.
- `apps/backend/AGENTS.md` requires behavior parity before a Rust route is
  considered migrated and requires splitting files that are substantially
  edited beyond 700 LOC. `workspaces_deleted.rs` is already above that ceiling.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; read
`apps/backend/AGENTS.md` fully. Do not begin until both nonterminal backend
migration notes release or explicitly transfer these paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Rust vectors | `cargo test --locked api_key_crypto -- --nocapture` from `apps/backend` | valid/malformed/mismatch vectors pass |
| Handler tests | `cargo test --locked workspaces_ -- --nocapture` from `apps/backend` | valid, invalid, expired, permission, and tenant cases pass |
| Backend gate | `bun check:backend` | exit 0, including native and Worker targets |
| TypeScript parity | `bun --cwd packages/auth vitest run src/api-keys.test.ts` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- New focused crate-private API-key crypto module under `apps/backend/src/`
- `apps/backend/src/workspaces_2.rs`
- `apps/backend/src/workspaces_deleted.rs` and sibling submodules needed to
  bring the substantially edited root below 700 LOC
- Focused Rust tests in sibling modules/files

Do not change TypeScript hashing, API-key format, permissions, route ownership,
dispatcher paths, Next handlers, or migration manifest status.

## Git workflow

- Branch: `fix/backend-v1-api-key-auth` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(backend): verify v1 workspace API keys`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Establish cross-language compatibility vectors

Use non-secret deterministic test inputs to prove the TypeScript contract:
stored form is `salt:hex`, the salt string is passed as UTF-8 rather than hex
decoded, parameters are N=16384/r=8/p=1, derived length matches the stored hash,
and comparison is constant-time. Cover valid, wrong key, malformed separator,
invalid hex, empty parts, and wrong derived length.

**Verify:** the same vectors pass in TypeScript and the existing working Rust
implementation before refactoring.

### Step 2: Extract one crate-private verifier

Move/copy the proven Rust primitives into a focused shared module with the
tightest visibility. Preserve Worker compatibility and avoid adding a new crate
unless the existing pure-Rust code cannot be shared safely. Switch the working
v2 implementation and the two v1 stubs to the same verifier so future changes
cannot drift.

**Verify:** searches find no unconditional-false v1 verifier and all vector
tests pass for native and Worker compilation.

### Step 3: Add handler-level success and denial tests

Drive each handler through its outbound HTTP mock. Cover valid same-workspace
key, wrong key, malformed/short key, expired candidate, same prefix with one
matching candidate, workspace mismatch, missing permission for deleted items,
and upstream failure. Assert no service-role data fetch occurs after auth
denial.

**Verify:** focused handler tests pass and a valid vector reaches the intended
workspace fetch instead of 401.

### Step 4: Split the oversized deleted-items module and run gates

Because this plan substantially edits `workspaces_deleted.rs`, move cohesive
crypto/auth and tests into sibling submodules per `apps/backend/AGENTS.md`,
keeping the public handler surface stable. Run every table command. Do not mark
the routes migrated or change traffic ownership in this plan.

## Test plan

Cross-language vectors are the compatibility oracle; handler tests verify query
shape, permission resolution, tenant binding, and fail-closed behavior.

## Done criteria

- [ ] Valid existing workspace API keys authenticate in both Rust v1 handlers.
- [ ] Invalid, malformed, expired, cross-workspace, and unpermitted keys fail.
- [ ] One tested shared verifier replaces both stubs and equivalent v2 use.
- [ ] No live ownership or migration-manifest status changes.
- [ ] Backend gate, TypeScript parity, `bun check`, and whitespace pass.

## STOP conditions

Stop if TypeScript vectors disagree with the existing Rust implementation, the
Worker target cannot compile the shared crypto, active migration ownership
remains nonterminal, or the fix requires changing issued key format.

## Maintenance notes

Route coverage is not parity when every authenticated success path is
unreachable. Future API-key Rust ports must consume this shared verifier and a
known-vector test.
