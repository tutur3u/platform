# Plan 269: Align Native TypeScript Release-Age Exceptions

> **Executor instructions:** Keep Bun's one-day release-age exception for the
> required native TypeScript toolchain exact, derived, and no broader than the
> root package plus its seven platform artifacts.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- bunfig.toml bun.lock scripts/type-check-consistency.test.js scripts/ci tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** dependencies / install policy
- **Depends on:** disposition of dirty `bunfig.toml`; native-CI test-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The repository deliberately exempts TypeScript and every classic
`@typescript/typescript-*` platform artifact from Bun's one-day release-age
policy. Twenty-nine Next workspaces instead pin `@typescript/native-preview`,
whose lock entry pulls seven `@typescript/native-preview-*` platform packages.
None is exempt, so a coordinated native-preview refresh can be rejected for its
first 24 hours even though the companion TS7 toolchain is explicitly trusted.

## Exact invariant

`minimumReleaseAgeExcludes` must contain exactly the native-preview root package
and every optional dependency name declared by the single locked
`@typescript/native-preview` entry:

- `@typescript/native-preview`
- `@typescript/native-preview-darwin-arm64`
- `@typescript/native-preview-darwin-x64`
- `@typescript/native-preview-linux-arm`
- `@typescript/native-preview-linux-arm64`
- `@typescript/native-preview-linux-x64`
- `@typescript/native-preview-win32-arm64`
- `@typescript/native-preview-win32-x64`

The validator derives the seven platform names from `bun.lock`; it must fail on
a missing, stale, or extra `@typescript/native-preview*` exclusion. Do not
change the one-day duration or exempt another publisher/package family.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. First disposition the
existing dirty `bunfig.toml` without overwriting it and obtain the native-CI
test-path transfer. Treat `bun.lock` as read-only evidence; Mail owns writes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused policy | `node --test scripts/type-check-consistency.test.js` | native-preview manifest and release-age family invariants pass |
| Lock immutability | `git diff --exit-code -- bun.lock` | no lockfile change |
| Install config | `bun install --frozen-lockfile --dry-run` | locked install accepts the config without rewriting state |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: only the eight exact `bunfig.toml` exclusions and a focused derived
invariant in the existing TypeScript consistency test (or the narrowest owned
CI config test after transfer).

Out of scope: dependency/version updates, lockfile writes, app manifests,
minimum-release-age duration, Next/Cloudflare exception families, global-store
policy, registry configuration, or native TypeScript rollout behavior.

## Steps

1. Prove all Next workspaces use one native-preview version and the lock entry
   declares exactly seven optional platform packages. Add a red test deriving
   those names from the lockfile and extracting the exact
   `minimumReleaseAgeExcludes` TOML array with a narrow fixture-tested parser;
   do not add a parser dependency merely for this invariant.
2. After dirty-file disposition, add the exact eight exclusions adjacent to the
   existing TypeScript family with a narrow explanatory comment.
3. Prove the test rejects a missing platform, a stale extra native-preview
   name, and any broadened `@typescript/*` wildcard/prefix policy.
4. Run focused policy, frozen/dry install, lock immutability, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] The required native-preview root and all seven locked platform artifacts are exempt.
- [ ] No other package family or release-age setting changes.
- [ ] A derived test fails on missing, stale, or broadened native-preview exceptions.
- [ ] `bun.lock` is unchanged and focused/repository/scope gates pass.

## STOP conditions

Stop if `bunfig.toml` ownership or dirty-state provenance is unresolved; the
locked native-preview graph has multiple versions or a non-platform optional
dependency; Bun does not apply release age to optional platform packages;
validation requires rewriting the lockfile; native-CI ownership is unavailable;
or any mandatory gate fails twice.
