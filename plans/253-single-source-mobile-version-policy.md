# Plan 253: Single-Source the TypeScript Mobile-Version Policy

> **Executor instructions:** Move the byte-identical Web and Infrastructure
> mobile-version/OTP policy into one server-only Auth package module. Keep both
> app-local paths as logic-free compatibility re-exports, consolidate the
> duplicate policy tests, and preserve every runtime behavior and public API.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/auth/src/mobile-version-policy.ts packages/auth/src/mobile-version-policy.test.ts packages/auth/package.json apps/web/src/lib/mobile-version-policy.ts apps/web/src/lib/mobile-version-policy.test.ts apps/infrastructure/src/lib/mobile-version-policy.ts apps/infrastructure/src/lib/mobile-version-policy.test.ts apps/web/src/lib/auth/otp.ts apps/web/src/lib/auth/otp.test.ts apps/infrastructure/src/lib/auth/otp.ts apps/infrastructure/src/lib/auth/otp.test.ts 'apps/web/src/legacy-api-routes/v1/mobile/version-check' 'apps/infrastructure/src/app/api/v1/infrastructure/mobile-versions' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/mobile-versions' apps/backend/src/mobile_version.rs tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active coordination note owns the exact
  TypeScript policy/test paths; inspect current notes before starting
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** architecture / security / test coverage
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Web and Infrastructure each execute and test a byte-identical 289-line policy
that controls mobile forced updates and OTP availability. Both copies are live:
Infrastructure owns administration while Web owns the production version-check
and auth path. A one-sided edit can make administration and enforcement
disagree while both local suites remain green. The duplicated source and tests
total 1,012 lines.

## Current state and exact contract

- `apps/web/src/lib/mobile-version-policy.ts` and
  `apps/infrastructure/src/lib/mobile-version-policy.ts` have identical SHA and
  content across all 289 lines. Their 217-line tests are also identical.
- Both `src/lib/auth/otp.ts:36-40,156-172` modules import their local copy.
  Infrastructure's mobile-version route/page and Web's legacy version-check
  route also import those app-local paths.
- `packages/auth` is private, already depends on Supabase and Utils, and is
  already a dependency of both apps. Add the explicit export
  `./mobile-version-policy` without any manifest dependency or lockfile change.
- Move the complete implementation to
  `packages/auth/src/mobile-version-policy.ts`. Keep each app-local module as
  exactly one `export * from '@tuturuuu/auth/mobile-version-policy';` statement
  so all existing imports and Vitest mocks remain stable during migration.
- Move the duplicated policy suite once to
  `packages/auth/src/mobile-version-policy.test.ts`; delete both app-local
  policy test copies. Existing OTP and route tests remain in their hosts and
  must pass unchanged.
- This plan does not alter policy keys, normalization, strict semver,
  validation, database loading, OTP behavior, error text, response envelopes,
  or the Rust implementation. `apps/backend/src/mobile_version.rs:526-632` is
  parity evidence and verification-only; backend source changes require a
  separate owner-approved plan.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-development-tooling`, and `$tuturuuu-commit`. Read root AGENTS.
Confirm the two source and two test SHA pairs remain identical before moving
anything. Do not use Bun to edit the manifest: this adds an export, not a
dependency.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Baseline identity | `shasum apps/web/src/lib/mobile-version-policy.ts apps/infrastructure/src/lib/mobile-version-policy.ts apps/web/src/lib/mobile-version-policy.test.ts apps/infrastructure/src/lib/mobile-version-policy.test.ts` | source hashes match each other and test hashes match each other before extraction |
| Caller inventory | `rg -n 'mobile-version-policy|MOBILE_VERSION_POLICY_CONFIG_KEYS|getMobileVersionPolicies|evaluateMobileVersionPolicy' apps packages --glob '!plans/**'` | every live TypeScript caller uses the package directly or a thin app re-export; Rust remains classified evidence |
| Shared policy | `bun --cwd packages/auth vitest run src/mobile-version-policy.test.ts` | all consolidated normalization, validation, loading, and evaluation cases pass |
| Host contracts | `bun --cwd apps/web vitest run src/lib/auth/otp.test.ts src/legacy-api-routes/v1/mobile/version-check/route.test.ts && bun --cwd apps/infrastructure vitest run src/lib/auth/otp.test.ts src/app/api/v1/infrastructure/mobile-versions/route.test.ts` | OTP and both route contracts pass through compatibility re-exports |
| Source contract | `test "$(wc -l < apps/web/src/lib/mobile-version-policy.ts | tr -d ' ')" -le 2 && test "$(wc -l < apps/infrastructure/src/lib/mobile-version-policy.ts | tr -d ' ')" -le 2 && ! rg -n 'createAdminClient|STRICT_SEMVER_REGEX|workspace_configs' apps/web/src/lib/mobile-version-policy.ts apps/infrastructure/src/lib/mobile-version-policy.ts` | both host files are logic-free and contain no old implementation marker |
| Types/builds | `bun run --cwd packages/auth type-check && bun run --cwd apps/web type-check && bun run --cwd apps/infrastructure type-check && bun run --cwd apps/web build && bun run --cwd apps/infrastructure build` | shared package and both live hosts compile/build |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** one new Auth policy module and consolidated test; Auth's export
map; both app-local policy modules converted to re-exports; deletion of their
duplicate policy tests. Existing OTP and mobile-version route tests may change
only if their import-mock path needs a mechanical compatibility adjustment.

**Out of scope:** OTP implementation or UI; mobile-version admin/version-check
behavior; database schema/config values; Rust code/OpenAPI; app/package
dependencies or `bun.lock`; first-class migration of the Web legacy route;
changing auth policy or errors; unrelated multi-session cleanup.

## Steps

1. Record the four hashes and full caller inventory. Run both duplicate policy
   suites plus OTP/route tests before moving code; any behavioral difference is
   a STOP.
2. Move one exact implementation and one exact test suite into `packages/auth`.
   Add the explicit server-only subpath export. Preserve symbols and imports;
   do not merge or redesign policy behavior during extraction.
3. Replace each app policy module with the one-line package re-export and
   remove both duplicate app policy suites. Keep callers on their existing
   local path so app-level mocks and later host migrations remain stable.
4. Run the consolidated package suite and all four representative host suites.
   Run the logic-free source contract and verify the only executable
   TypeScript definitions are package-owned.
5. Run types, serialized Web/Infrastructure builds, `bun check`, whitespace,
   manifest-parse, and exact-scope gates.

## Done criteria

- [ ] One package-owned TypeScript implementation and one policy suite remain.
- [ ] Both app-local modules are logic-free compatibility re-exports and every
      current caller compiles without behavior changes.
- [ ] OTP, admin, version-check, keys, semver, validation, and error contracts
      are unchanged; Rust is untouched.
- [ ] All commands above pass and `bun.lock` is unchanged.

## STOP conditions

Stop if hash pairs differ, a hidden host-specific behavior/import exists,
`packages/auth` would create a dependency cycle, an existing caller cannot use
the re-export without behavior change, Rust or schema changes become necessary,
an active exact-path owner appears, or any mandatory gate fails twice.

## Maintenance notes

All future TypeScript mobile-version/OTP policy changes belong in Auth and its
single suite. Reviewers must separately check the prepared Rust contract before
changing semantics; this extraction deliberately does not claim cross-language
single-source parity.
