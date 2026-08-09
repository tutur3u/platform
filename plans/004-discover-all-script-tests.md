# Plan 004: Discover Every Repository Script Test

> **Executor instructions:** Follow every step and gate. Preserve intentional
> test roots and exclusions; do not blindly execute fixtures/generated files.
> Stop and report on STOP conditions, then update the index row.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- package.json scripts/check.js scripts .github/actions/run-with-turbo-remote-cache apps/database/scripts plugins/tuturuuu/skills/tuturuuu-pr-merge-sync/scripts`
> Recompute the old-list/discovered-list difference if any test path changed.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Tests / Developer Experience
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

`bun check` runs `bun run test:scripts`, but that package script is a manually
maintained list. Fifteen `scripts/**/*.test.{js,mjs}` files are currently absent,
including deployment control, blue/green watcher, E2E ownership, i18n, and CI
resolver tests. One omitted Hive build-wrapper test is already failing, proving
that the canonical gate can remain green while checked-in script regressions go
unseen.

## Current state

- `scripts/check.js` invokes `bun run test:scripts` as the `script-tests` step.
- `package.json` embeds a long list of individual test paths.
- A set comparison at the audited SHA found these 15 exact omissions:
  `scripts/check-mobile-api-mappings.test.js`,
  `scripts/ci/resolve-production-vercel-targets.test.js`,
  `scripts/cron-runner-entrypoint.test.js`,
  `scripts/docker-control-recovery.test.js`,
  `scripts/e2e-owned-satellites.test.js`,
  `scripts/e2e-tasks-satellite.test.js`,
  `scripts/i18n-namespace-check.test.js`,
  `scripts/mobile-deployment/hydrate-bundle.test.mjs`,
  `scripts/portless-safe-dev.test.js`,
  `scripts/run-hive-docker-next-build.test.js`, and
  `scripts/watch-blue-green-{control,github-checks,logs,projects,telemetry}.test.js`.
- The current command also intentionally includes tests outside `scripts/`, such
  as a local GitHub action, database scripts, and a plugin watcher test.
- A read-only run of all 15 files at the planned commit executed 80 tests: 79
  passed and
  `scripts/run-hive-docker-next-build.test.js:55` failed. It expects an 8 GiB
  container to yield `--max-old-space-size=7168`, while the shared current
  policy in `scripts/run-web-docker-next-build.js:83-88` intentionally assigns
  the 4096 MiB minimum below the 10 GiB threshold. The test did not follow that
  later shared-policy change because it was absent from `test:scripts`.

Current failing excerpt:

```js
// scripts/run-hive-docker-next-build.test.js:68-71
assert.equal(
  env.NODE_OPTIONS,
  '--trace-warnings --max-old-space-size=7168 --experimental-require-module'
);
```

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`, and
`$tuturuuu-agent-coordination`. Inspect every omitted test for environment,
network, Docker, timing, or destructive assumptions before adding it to CI.

## Exact scope

Allowed files are `package.json`,
`scripts/run-hive-docker-next-build.test.js`, new
`scripts/run-script-tests.js`, and new `scripts/run-script-tests.test.js`. Do
not edit `scripts/run-web-docker-next-build.js`: its 4096 MiB result matches the
documented current small-container policy. Do not edit `scripts/check.js`; it already calls
`bun run test:scripts`. Preserve these supplemental existing roots explicitly:
`.github/actions/run-with-turbo-remote-cache/action.test.js`,
`apps/database/scripts/*.test.js`, and
`plugins/tuturuuu/skills/tuturuuu-pr-merge-sync/scripts/watchers.test.mjs`.

In scope: a deterministic test discovery runner, explicit supplemental roots and
exclusions, package-script simplification, self-tests, and canonical gate parity.

Out of scope: fixing unrelated failures inside newly activated tests, enabling
true E2E suites that require secrets/services, or changing Node's test semantics.

## Git workflow

- Branch: `fix/discover-script-tests` in an isolated worktree.
- Conventional Commit: `test(tooling): discover script tests automatically`.
- Do not push/open a PR unless asked. Claim the commit window before staging or
  committing; never stage coordination notes.

## Steps

1. **Repair the exposed stale Hive assertion.** In
   `scripts/run-hive-docker-next-build.test.js`, change only the expected heap
   value from 7168 to 4096 for the 8 GiB fixture. Keep the CPU, static-generation,
   inherited `NODE_OPTIONS`, and Node delegation assertions unchanged. Do not
   change the shared runtime policy to satisfy a stale omitted test.

   Verify:

   ```bash
   node --test scripts/run-hive-docker-next-build.test.js
   ```

   Expected: 4 tests pass, 0 fail.

2. **Confirm all 15 omissions are intended hermetic tests.** The advisor already
   inspected and ran them: they use synthetic fixtures, injected process/network
   seams, or temporary directories, and none requires credentials, Docker, or
   external network. No exclusion is currently justified. Re-run the exact set:

   ```bash
   node --test \
     scripts/check-mobile-api-mappings.test.js \
     scripts/ci/resolve-production-vercel-targets.test.js \
     scripts/cron-runner-entrypoint.test.js \
     scripts/docker-control-recovery.test.js \
     scripts/e2e-owned-satellites.test.js \
     scripts/e2e-tasks-satellite.test.js \
     scripts/i18n-namespace-check.test.js \
     scripts/mobile-deployment/hydrate-bundle.test.mjs \
     scripts/portless-safe-dev.test.js \
     scripts/run-hive-docker-next-build.test.js \
     scripts/watch-blue-green-control.test.js \
     scripts/watch-blue-green-github-checks.test.js \
     scripts/watch-blue-green-logs.test.js \
     scripts/watch-blue-green-projects.test.js \
     scripts/watch-blue-green-telemetry.test.js
   ```

   Expected at the planned commit after step 1: 80 tests pass, 0 fail. Any test
   that attempts a live side effect is a STOP and requires plan reconciliation.

3. **Create a Node discovery runner.** Add `scripts/run-script-tests.js`, a small
   script that recursively walks
   declared roots, selects `*.test.js` and `*.test.mjs`, applies an explicit
   exclusion policy, sorts paths, and spawns `node --test` with an argument array
   (no shell interpolation). Preserve the existing external roots explicitly.
   Keep discovery logic exportable for unit tests and the file below 400 LOC.

   Verify: `node scripts/run-script-tests.js --list` exits 0, prints sorted
   repo-relative paths, includes all currently manual entries and all classified
   omissions, and contains no duplicates.

4. **Make discovery observable.** Print the number of selected files and, on a
   list/dry-run flag, their repo-relative paths. Fail if a configured root is
   missing or discovery unexpectedly returns zero. Preserve clean Node TAP output
   sufficiently for `scripts/check.js` to extract test counts.

   Verify: missing-root and zero-discovery fixtures exit nonzero with the root
   named; a normal dry run reports a positive selected count.

5. **Test the runner.** Use temporary fixture directories to prove recursive
   JS/MJS discovery, deterministic order, explicit exclusions, spaces in paths,
   missing roots, supplemental roots, child exit-code propagation, and that a
   newly added test is discovered without editing `package.json`.

   Verify: `node --test scripts/run-script-tests.test.js` exits 0.

6. **Replace the manual package script.** Point `test:scripts` to the runner.
   Remove the path wall only after a dry-run comparison accounts for every old
   entry and every newly included test.

   Verify: `package.json` contains only the runner command for `test:scripts`,
   and the runner's `--list` set equals the pre-change manual set plus every
   approved omission.

7. **Verify canonical integration.** Run runner unit tests, `bun run
   test:scripts`, the `script-tests` slice if supported, then `bun check`.

   Expected: all commands exit 0; `git diff --check` has no output. Do not invent
   a slice flag if `scripts/check.js --help` does not advertise one.

## Commands you will need

```bash
node --test scripts/run-script-tests.test.js
bun run test:scripts
bun check
git diff --check
```

## Test plan

Create `scripts/run-script-tests.test.js` with temp-directory fixtures and a
stub child runner. Cover recursive JS/MJS discovery, deterministic order,
exclusions, supplemental roots, missing/empty roots, spaces, dry-run output,
and child exit propagation. Run each newly activated test alone first.

## Done criteria

- [ ] Every intended repository script unit test is discovered automatically.
- [ ] The stale Hive heap-policy test passes with the current documented 4096 MiB
  small-container result.
- [ ] Every exclusion is explicit, justified, and owned by another gate.
- [ ] Adding a normal test under a configured root requires no package-script edit.
- [ ] The runner preserves deterministic execution, exit status, and useful output.
- [ ] `bun check` exercises the discovery-backed suite.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if an omitted file is actually a live/destructive integration test, if
activation requires secrets or external services, or if discovery would include
fixtures/generated trees without a stable exclusion boundary.

## Maintenance notes

Future script unit tests should need no manifest edit. Reviewers should reject
broad exclusions and ensure environment-dependent tests have an explicit
alternative gate owner.
