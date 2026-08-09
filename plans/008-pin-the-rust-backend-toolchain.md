# Plan 008: Pin and Verify the Rust Backend Toolchain

> **Executor instructions:** Make the compiler version deterministic across
> local rustup and both backend CI jobs. Do not upgrade Rust or dependencies as
> part of this plan; pin the version already declared by the backend package.

## Status

- **Execution status:** BLOCKED — Rust workflow ownership remains in
  `tmp/agent-coordination/20260710-142120-native-ci-cache-artifacts.md`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Migration / CI / Developer Experience
- **Depends on:** none
- **Planned at:** `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b`, 2026-08-10

Do not edit `.github/workflows/rust-backend.yml` while that note remains
`handoff`. Reconcile its pending combined CI/cache work first.

## Why this matters

The future Rust backend declares a minimum language version but local and CI
selection floats. A new stable compiler can change formatting, lint results,
MSRV resolution, Cargo behavior, or worker builds without any repository diff.

## Current evidence

`apps/backend/Cargo.toml:4-5` declares:

```toml
edition = "2024"
rust-version = "1.95"
```

There is no `rust-toolchain` file. Both setup steps in
`.github/workflows/rust-backend.yml` use
`dtolnay/rust-toolchain@stable` (near lines 103 and 498), and
`scripts/check-backend.js` checks only whether `cargo --version` succeeds.

## Allowed files

- New `apps/backend/rust-toolchain.toml`
- `.github/workflows/rust-backend.yml` (only its two Rust setup steps)
- `scripts/check-backend.js` and its existing or new focused unit test
- A focused backend setup paragraph in the existing docs page; do not add a new
  page unless navigation already requires one.

## Steps

1. **Preflight.** Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`, and
   `$tuturuuu-agent-coordination`; read `apps/backend/AGENTS.md`. Run:

   ```bash
   git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- \
     apps/backend/Cargo.toml apps/backend/rust-toolchain.toml \
     .github/workflows/rust-backend.yml scripts/check-backend.js
   ```

   Expected: no compiler-selection drift. Any changed MSRV/setup step is a STOP.

2. **Add the directory toolchain pin.** Create
   `apps/backend/rust-toolchain.toml` with channel `1.95.0`, minimal profile,
   components `clippy` and `rustfmt`, and target `wasm32-unknown-unknown`. Keep
   `Cargo.toml` at its existing compatible `rust-version = "1.95"`.

   Verify from `apps/backend`: `rustup show active-toolchain` includes `1.95.0`
   and `rustc --version` starts with `rustc 1.95.0`. If the toolchain is not
   installed and network installation was not authorized, record the live check
   as unrun; do not weaken the pin.

3. **Pin both CI setup steps.** Replace each `@stable` selector with the exact
   `@1.95.0` selector and keep the existing components/worker target. The native
   and coverage jobs must select the same compiler as the directory file.

   Verify:
   `rg -n "dtolnay/rust-toolchain@|1\.95\.0" .github/workflows/rust-backend.yml apps/backend/rust-toolchain.toml`
   shows two exact workflow selectors and one toolchain channel; no `@stable`
   remains in the backend workflow.

4. **Make drift fail locally.** Add a small, exported checker in
   `scripts/check-backend.js` (or a focused sibling module if needed to keep the
   file maintainable) that parses the Cargo MSRV, toolchain channel, and the two
   workflow selectors. Accept patch-pinned `1.95.0` as compatible with MSRV
   `1.95`; fail with file-specific expected/actual diagnostics if the sources
   disagree or a workflow floats.

   Verify its unit test covers clean, missing toolchain, floating workflow,
   mismatched native/coverage selectors, and incompatible Cargo MSRV; expected
   `node --test ...` exit 0.

5. **Document and run gates.** State that entering `apps/backend` selects the
   pinned compiler and how to install it with rustup. Run the focused script
   test, `bun check:backend --skip-worker` if the compiler is available,
   `bun check`, and `git diff --check`. Expected: exit 0/no whitespace output.
   Do not run a build unless explicitly authorized.

## Done criteria

- [ ] Local rustup and both CI jobs select Rust 1.95.0.
- [ ] A repository check rejects missing, floating, or inconsistent selectors.
- [ ] The declared Cargo MSRV remains compatible and is not upgraded.
- [ ] Focused tests, available backend checks, `bun check`, and
  `git diff --check` pass; unavailable toolchain checks are explicit.

## STOP conditions

Stop if Rust 1.95.0 is unavailable to rustup/CI, the backend now requires a
newer compiler, another active coordination note owns the backend workflow, or
pinning forces dependency/lockfile changes. Re-audit and choose a currently
available exact patch release instead of falling back to `stable`.
