# Plan 097: Enroll Satellite Shells in Translation Contract Checks

> **Executor instructions:** Enroll apps incrementally and require only keys
> from shared components each app actually renders. Do not bulk-copy all shared
> catalogs.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- scripts/i18n-namespace-check.js packages/satellite/src/components apps/chat/messages apps/mail/messages apps/chat/src/app apps/mail/src/app scripts`
> Stop on validator, shared shell, message, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** dx / correctness
- **Depends on:** Chat, Mail, and CI/tooling ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Nine satellites are deliberately skipped by the shared translation namespace
validator. Chat and Mail both render the shared notification popover but omit
unconditional keys such as `notifications.accept`, `notifications.decline`,
and `common.retry`, so repository checks can stay green while production emits
missing-message failures.

## Current state

- `scripts/i18n-namespace-check.js:101-116` registers nine message-bearing
  satellites as `UNCHECKED_APPS`.
- `packages/satellite/src/components/notification-popover.tsx:21-41` resolves
  the named common/notification keys unconditionally.
- Chat and Mail dashboard layouts import the shared shell, while their English
  notification namespaces omit accept/decline; Vietnamese parity must be
  checked rather than assumed.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`, and coordination.
Execution is blocked by broad Chat/Zalo, Mail catch-all, and CI/tooling owners.
Obtain exact path transfer; never edit another owner's messages concurrently.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Validator tests | `bun test scripts/i18n-namespace-check.test.js` | scoped app fixtures pass |
| Namespace check | `bun i18n:namespace-check` | Chat and Mail enrolled with no missing live keys |
| Sort | `bun i18n:sort` | deterministic en/vi bundles |
| Chat tests | `bun run --cwd apps/chat test` | shared-shell tests pass |
| Mail tests | `bun --cwd apps/mail vitest run src/app/shared-notification-shell.test.tsx` | shared-shell tests pass |
| App builds | `bun run --cwd apps/chat build && bun run --cwd apps/mail build` | both exit 0 |
| Repository | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- i18n namespace validator/config and focused fixtures/tests
- Chat/Mail English and Vietnamese bundles
- focused shared notification-shell rendering tests in each app
- README status

Do not enroll all nine apps at once, copy unused namespaces, change shared UI
behavior, or edit message bundles outside Chat/Mail in this plan.

## Git workflow

After transfer, use `fix/satellite-translation-contracts` in an isolated
worktree and run `bun setup`. Commit `fix(i18n): validate satellite shell keys`.

## Steps

1. Add validator fixtures proving per-app shared-component scopes include
   unconditional keys while excluding components the app does not ship.
2. Move Chat from `UNCHECKED_APPS` into checked configuration with its actual
   shared shell scope; add missing semantically correct en/vi keys and a render
   regression.
3. Repeat independently for Mail. Keep each app's key list source-derived and
   document the rule for enrolling the remaining seven.
4. Sort bundles and run validator, app tests/builds, and `bun check`.

## Done criteria

- [ ] Chat and Mail are no longer skipped by the namespace validator.
- [ ] Their live shared notification shells resolve every unconditional key.
- [ ] English/Vietnamese bundles remain key-parity sorted.
- [ ] Validator/app tests, both builds, and `bun check` pass.

## STOP conditions

Stop until all owners transfer, if the validator cannot express per-app shared
component scopes without false positives, or a required gate fails twice.

## Maintenance notes

Enroll the other unchecked satellites one bounded app at a time using the same
source-derived contract.
