# Plan 320: Require Expiry for Drive Export Capabilities

> **Executor instructions:** Make Drive export bearer capabilities expire under
> one explicit TypeScript/Rust policy. Preserve the token wire format and the
> downstream 15-minute signed URL. Do not treat the prepared Rust handler as
> deployed production.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- packages/storage-core/src/lib/workspace-storage-export-links.ts packages/storage-core/src/lib/workspace-storage-export-links.test.ts 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/storage/export/[token]/[...assetPath]/route.ts' apps/backend/src/workspaces_storage_export_assetpath.rs apps/backend/src/workspaces_storage_export_assetpath apps/docs/build/devops/web-docker-deployment.mdx tmp/agent-coordination`
> Stop on token-format, status-envelope, handler-registration, or active-owner
> drift.

## Status

- **Execution status:** BLOCKED — obtain exact Rust/backend migration transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / correctness
- **Depends on:** backend migration ownership transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

The capability token is sufficient to mint fresh storage reads without another
actor check. Missing, malformed, zero, or negative TTL configuration currently
disables expiry in both runtimes, converting a short-lived export link into a
permanent bearer capability.

## Current state and exact contract

- `packages/storage-core/src/lib/workspace-storage-export-links.ts:11-14`
  defaults `DRIVE_EXPORT_LINK_TTL_SECONDS` to `0`; lines 125-169 verify the HMAC
  but enforce age only when the parsed value is positive.
- The Web export handler at
  `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/storage/export/[token]/[...assetPath]/route.ts:25-49`
  trusts the token and issues a new 900-second signed URL.
- `apps/backend/src/workspaces_storage_export_assetpath.rs:220-227,267-270`
  mirrors the same optional positive-TTL behavior. The file is 855 lines, so
  substantial edits require extraction below 700 lines.
- Freeze one policy: blank/missing configuration uses a built-in `86400`-second
  default; an explicit value must be an integer from `60` through `604800`.
  Malformed, nonpositive, or out-of-range explicit values are configuration
  errors mapped to sanitized 500 responses. Resolve policy per operation, not
  once at module import. Existing tokens older than the effective TTL expire.
- Preserve token version, fields, signature, path validation, success/error
  envelopes, cache behavior, and the downstream 15-minute signed URL.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Storage tests | `bun --cwd packages/storage-core vitest run src/lib/workspace-storage-export-links.test.ts` | all config, expiry, signature, and compatibility cases pass |
| Storage types | `bun --cwd packages/storage-core type-check` | exit 0 |
| Rust | `(cd apps/backend && cargo test --locked workspaces_storage_export_assetpath)` | focused handler/token tests pass |
| Backend | `bun check:backend` | exit 0 |
| Live Web | `bun run build:web` | live consumer compiles |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size/scope | `wc -l apps/backend/src/workspaces_storage_export_assetpath.rs && git status --short` | Rust root is below 700 lines; only in-scope files changed |

## Scope

**In scope:** the Storage Core token helper and new focused test; extracting a
cycle-free Rust token/config submodule and tests while preserving the handler's
public registration; the Web deployment runbook's TTL contract.

**Out of scope:** changing export authorization, token version/shape/signing
secret, storage-object permissions, downstream signed-URL duration, deploying
or cutting traffic to Rust, or changing unrelated Drive routes.

## Git workflow

- Branch: `fix/expire-drive-export-capabilities` in an isolated worktree; run
  `bun setup` immediately.
- Commit: `fix(storage): expire Drive export capabilities`.
- Do not push/open a PR unless instructed; claim the commit window before
  staging.

## Steps

1. Add Storage Core tests for missing/blank default, minimum/maximum, malformed,
   fractional, zero, negative, out-of-range, expired/unexpired, invalid
   signature, and repeated environment changes in one process.
2. Replace the fail-open numeric constant with a validated per-call policy
   resolver and typed `WorkspaceStorageError`; keep creation and verification on
   the same policy and keep all token bytes unchanged.
3. Extract Rust TTL/token parsing and verification into
   `apps/backend/src/workspaces_storage_export_assetpath/token.rs` with focused
   tests. Match the exact limits/default/error mapping and leave the parent
   handler under 700 lines.
4. Document the default, allowed range, invalid-config failure, and existing-link
   expiry. Run every gate above.

## Test plan and done criteria

- [ ] TypeScript and Rust share the exact default/range and reject every invalid
  explicit value.
- [ ] A token older than the effective TTL cannot mint a new storage URL in
  either runtime; an unexpired token still can.
- [ ] Token serialization/signature and 900-second downstream URL behavior are
  unchanged.
- [ ] Both runtime suites, builds/checks, size, scope, and whitespace gates pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if the signing format differs between runtimes, the Web handler has gained
another actor check, an external compatibility contract requires permanent
links, the Rust path is actively owned, or the split cannot preserve the
registered handler surface without touching unrelated backend dispatch files.

## Maintenance notes

Review future token versions and configuration changes in both runtimes. The
finite default is a security boundary, not an optional deployment tuning knob.
