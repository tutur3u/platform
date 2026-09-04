# Plan 268: Make Mobile Setup Lockfile-Preserving

> **Executor instructions:** Make routine Mobile setup install exactly the
> committed Flutter resolution and move dependency upgrades behind an explicit,
> opt-in command.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- package.json scripts apps/docs apps/mobile/pubspec.yaml apps/mobile/pubspec.lock apps/mobile/ios/Podfile.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / reproducible setup
- **Depends on:** Forms root-package ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The root command named `setup:mobile` runs both `flutter pub get` and
`flutter pub upgrade`. Because the Mobile manifest uses dependency ranges, a
routine setup can silently select newer allowed packages and rewrite committed
Flutter and iOS lock state before any feature work. Maintained CI/release
runbooks use `flutter pub get`, so local setup is less reproducible than the
verification path.

## Exact command contract

- `setup:mobile`: `(cd apps/mobile && flutter pub get)` only.
- `deps:update:mobile`: `(cd apps/mobile && flutter pub upgrade)` as the clearly
  named, opt-in upgrade operation.
- Neither command edits app version metadata. Intentional plugin changes still
  require the normal generated/Pod lockfile review.

## Required skills and preflight

Load `$tuturuuu-mobile-task-board`, `$tuturuuu-development-tooling`,
`$tuturuuu-ci-docs`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Obtain exact `package.json` transfer from the Forms handoff. Inventory docs and
automation callers before renaming or adding a script.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Script contract | `node --test scripts/mobile-setup-contract.test.js` | setup contains `pub get`, not `pub upgrade`; update command is explicit |
| Lock preservation | `(cd apps/mobile && shasum pubspec.lock ios/Podfile.lock > /tmp/mobile-locks.before && flutter pub get && shasum pubspec.lock ios/Podfile.lock > /tmp/mobile-locks.after && diff -u /tmp/mobile-locks.before /tmp/mobile-locks.after)` | committed lockfiles are unchanged on the supported toolchain |
| Mobile checks | `(cd apps/mobile && flutter analyze && flutter test)` | analysis and tests pass |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: root script names/commands; one discovered root script-contract test;
the narrow setup section in Mobile/devops docs if it names the old behavior.

Out of scope: changing any Flutter dependency/version, regenerating lockfiles,
Pods upgrades, app build/version metadata, CI toolchain upgrades, Flutter builds,
or broad Mobile README replacement.

## Steps

1. Inventory every `setup:mobile` caller and confirm none intentionally relies
   on upgrading. Add a red script-contract test discovered by `test:scripts`.
2. Change setup to `flutter pub get` and add the explicit upgrade command. Do
   not manually edit dependency declarations.
3. Align only docs that describe the setup/upgrade distinction. Keep release
   commands and app-version ownership unchanged.
4. Run the contract, lock-preservation, Mobile analysis/tests, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] Routine Mobile setup never invokes `flutter pub upgrade`.
- [ ] Intentional dependency refresh has a clearly named opt-in command.
- [ ] Setup leaves committed Flutter and Pod lockfiles unchanged.
- [ ] Script discovery, Mobile analysis/tests, repository, and scope gates pass.

## STOP conditions

Stop if a maintained caller intentionally depends on implicit upgrades; the
supported Flutter toolchain changes lockfiles on plain `pub get`; root-package
ownership is unavailable; setup requires dependency changes; or any mandatory
gate fails twice.
