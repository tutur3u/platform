# Plan 279: Protect Hot Rust Build Targets from Pruning

> **Executor instructions:** Make ordinary Rust cache pruning preserve build
> targets with recent descendant activity, even when the size cap is exceeded.
> Report unresolved excess non-destructively and require an explicit manual
> force mode before deleting hot output after builds have stopped.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- scripts/rust-cache.js scripts/rust-cache.test.js apps/docs/build/devops/web-docker-deployment.mdx apps/docs/overview/agent-operating-manual.mdx apps/docs/build/development-tools/codex-plugin.mdx plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md plugins/tuturuuu/skills/tuturuuu-agent-coordination/references/coordination-protocol.md tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW-MEDIUM
- **Category:** DX / build-cache safety
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The bounded Rust cleanup groups the entire Cargo target by immediate entries
such as `debug` and `release`, dates them using only that parent directory, and
may delete even a one-minute-old entry under size pressure. Nested compiler
activity does not reliably refresh the parent mtime, and deleting fresh output
can race an active build or force a complete rebuild. Storage limits should
remain truthful without treating hot artifacts as disposable.

## Current state and exact contract

- `scripts/rust-cache.js:140-155` reports the recursive size of each immediate
  target entry but records only the immediate entry's `lstatSync().mtimeMs`.
- `scripts/rust-cache.js:182-216` first selects stale directories, then selects
  every remaining directory oldest-first until projected size is within 20 GiB.
  It has no hot-entry grace or unresolved-excess result.
- `scripts/rust-cache.test.js:60-95` explicitly expects a one-minute-old
  `release` directory to be selected under size pressure.
- Keep the existing 14-day stale default, 20-GiB size default, dry-run/apply
  distinction, once-per-24-hour auto state, environment overrides, symlink
  exclusion, and default CI skip.
- Define each immediate target entry's `activityMtimeMs` as the maximum mtime of
  the entry and every non-symlink descendant visited during the existing size
  walk. Do not follow symlinks or count anything outside the configured target.
- Add a fixed default hot grace of **30 minutes**, configurable only through
  positive `TUTURUUU_RUST_CACHE_HOT_GRACE_MINUTES` or
  `--hot-grace-minutes <positive number>`. An entry is hot when
  `activityMtimeMs >= now - hotGraceMinutes`.
- Ordinary `prune` and `auto` may delete stale/cold entries but must never select
  a hot entry merely to satisfy the size cap. If cold deletion cannot reach the
  cap, return `unresolvedExcessBytes`, formatted `unresolvedExcess`, and the
  deterministic `hotEntries` that blocked further cleanup; this is a successful,
  non-destructive maintenance result, not a false claim that the cap was met.
- Add `--force-hot` only to `prune`. It is valid only with `--apply`, must be
  rejected for `report`, dry-run `prune`, and `auto`, and allows size-pressure
  selection of hot entries only after the operator has stopped Cargo/Rust
  builds. Stale/cold candidates remain first. The JSON result must record
  `forceHot: true` and every hot deletion's reason distinctly.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/backend
AGENTS, the entire Rust-cache helper and tests, every scoped documentation
paragraph, and current ownership notes. Run only `report` against the real
checkout; all prune/apply verification must use disposable test fixtures.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Current report | `bun rust-cache report` | valid JSON; no deletion occurs |
| Focused cache | `node --test scripts/rust-cache.test.js` | descendant activity, hot grace, unresolved excess, stale/cold, force, and argument cases pass |
| Discovery | `node scripts/run-script-tests.js --list | rg '^scripts/rust-cache\.test\.js$'` | exactly one matching discovered test path |
| Full scripts | `bun test:scripts` | Plan 004's discovered script suite passes |
| Repository | `bun check && git diff --check` | canonical checks pass; whitespace output is empty |

## Scope

**In scope:** `scripts/rust-cache.js` and its existing focused test; only the
Rust-cache safety paragraphs in
`apps/docs/build/devops/web-docker-deployment.mdx`,
`apps/docs/overview/agent-operating-manual.mdx`,
`apps/docs/build/development-tools/codex-plugin.mdx`,
`plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md`,
and
`plugins/tuturuuu/skills/tuturuuu-agent-coordination/references/coordination-protocol.md`.

**Out of scope:** deleting real build output; changing Cargo profiles,
dependencies, the Rust toolchain, `CARGO_TARGET_DIR`, Docker/CI cache policy,
the 14-day/20-GiB/24-hour defaults, enabling auto in CI, process inspection,
global Cargo caches, or broad disk cleanup.

## Steps

1. Refactor the existing recursive filesystem walk to return both total bytes
   and maximum descendant activity without a second traversal. Add fixtures
   proving a recent nested object makes an old parent hot, symlinks are ignored,
   empty directories use their own mtime, and report JSON exposes deterministic
   `activityMtimeMs` values.
2. Add the 30-minute default and positive CLI/environment parsing. Test the
   exact boundary immediately before/at/after the cutoff and invalid zero,
   negative, missing, and nonnumeric values. Preserve existing age, size, state,
   target, and CI behavior.
3. Change selection so stale and cold size-pressure candidates are ordered and
   removed as before, while hot entries remain excluded. Calculate unresolved
   excess from the projected post-candidate size and expose both byte/formatted
   values plus sorted blocking hot entries in dry-run, applied prune, and auto
   results. Test a single fresh target larger than 20 GiB without allocating a
   large fixture.
4. Add the manual `prune --apply --force-hot` escape hatch. Reject every other
   command/mode combination before filesystem mutation. Prove forced selection
   happens only after stale/cold candidates, is labeled separately, and remains
   confined to the configured target.
5. Align all scoped docs: ordinary prune/auto preserve 30-minute-hot entries and
   can truthfully report unresolved excess; operators must stop builds, inspect
   a dry report, and explicitly use `prune --apply --force-hot` only when
   reclaiming hot output is worth the rebuild. Do not imply that auto always
   reaches the cap.
6. Run real report, focused/discovery/full script tests, `bun check`, whitespace,
   and exact-scope review. Never run apply against `apps/backend/target`.

## Done criteria

- [ ] Activity uses the newest non-symlink descendant mtime, not only the
      immediate target directory.
- [ ] Ordinary prune and auto never select an entry active within the fixed
      30-minute default grace, including under size pressure.
- [ ] Unmet size caps return deterministic non-destructive excess and blocking-
      hot-entry metadata.
- [ ] Only `prune --apply --force-hot` can delete hot entries, and invalid force
      combinations fail before mutation.
- [ ] Nested-mtime, cutoff, stale/cold, fresh-size-pressure, force, path, report,
      and docs contracts are covered; focused/full script, repository, and
      whitespace gates pass.

## STOP conditions

Stop on an active exact-path owner; evidence that target entries contain
non-regenerable data; inability to compute descendant activity without following
symlinks; a requirement for OS-specific process inspection; any proposal to
force hot deletion from `auto`; a real target deletion during verification; or
any mandatory gate failing twice.

## Maintenance notes

The size cap is a maintenance target, not permission to interrupt active work.
If future Cargo layouts make immediate target entries too coarse, preserve the
hot-grace and unresolved-excess invariants while refining the grouping; do not
silently weaken them to guarantee a nominal cap.
