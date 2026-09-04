# Plan 311: Pin and Verify the Rust Worker Build CLI

> **Executor instructions:** Pin the exact `worker-build` crate used by both
> Rust verification and deployment. Do not upgrade Rust or application crates.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- .github/workflows/rust-backend.yml scripts/check-cloudflare-workers.js scripts/check-cloudflare-workers.test.js apps/docs/build/devops/github-actions-runbook.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — native CI/cache handoff owns the Rust workflow
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** dx / supply chain
- **Depends on:** Plan 008 sequencing; native CI/cache exact-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Both Rust CI jobs run `cargo install worker-build --locked` without a crate
version. `--locked` fixes dependencies only after Cargo selects a release, so an
unchanged repository commit can install a newer build tool and emit different
Worker artifacts or fail unexpectedly.

## Current state and exact contract

- `.github/workflows/rust-backend.yml:140-144` installs the CLI for verification;
  lines 512-518 repeat it for deploy. Both float the selected crate version.
- `scripts/check-cloudflare-workers.js:268-270` currently requires the floating
  command, so the validator entrenches rather than prevents drift.
- Choose one currently reviewed published `worker-build` version compatible
  with the Plan 008 Rust 1.95.0 toolchain. Use the exact same command in both
  jobs: `cargo install worker-build --version '<exact-semver>' --locked`, then
  run `worker-build --version` and assert the expected version before use.
- Extend the focused checker to parse both jobs and reject missing `--version`,
  non-exact selectors, mismatch, duplicate installs, or missing version proof.
  Keep the version in one exported validator constant or derive one exact value
  from the workflow; do not create two manually synchronized authorities.
- Document how to review and update the CLI together with Rust compatibility.
  Do not modify `Cargo.lock`: this is an installed CI tool, not an application
  dependency.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain the native CI
workflow transfer and sequence with Plan 008 so its two workflow edits are
rebased once. Registry lookup is read-only; record no credentials.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Registry review | `cargo search worker-build --limit 1` | selected exact release is visible and reviewed |
| Workflow contract | `rg -n 'cargo install worker-build|worker-build --version' .github/workflows/rust-backend.yml` | two identical exact installs and two version proofs |
| Focused test | `bun test scripts/check-cloudflare-workers.test.js` | floating/missing/mismatched/valid fixtures pass |
| Worker validator | `bun scripts/check-cloudflare-workers.js` | Rust Worker workflow contract passes |
| Script fleet | `bun test:scripts` | root-discovered script suite passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** two `worker-build` install/version-check steps; focused Cloudflare
Worker validator/test; narrow existing DevOps runbook paragraph.

**Out of scope:** Rust compiler pin (Plan 008); Cargo dependencies/lockfile;
Worker source; deploy behavior/secrets; GitHub Action pinning (Plan 298).

## Steps

1. Add validator fixtures that fail the current floating commands and every
   missing/mismatched selector shape.
2. Review one exact compatible release, pin both installs, and verify the CLI
   version before either build.
3. Update the validator and run focused, script-fleet, and repository gates.

## Done criteria

- [ ] Verification and deploy install the same exact `worker-build` release.
- [ ] CI proves the installed version before building.
- [ ] Canonical validation rejects floating or divergent selectors.
- [ ] Rust toolchain and application dependencies remain unchanged.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active native-CI ownership; incompatibility with Rust 1.95.0; a required
Cargo/app dependency change; inability to verify the release from the official
registry; or a mandatory gate failing twice.

## Maintenance notes

Review `worker-build` and Rust compatibility together, but keep their selectors
independently explicit so either drift is diagnosed precisely.
