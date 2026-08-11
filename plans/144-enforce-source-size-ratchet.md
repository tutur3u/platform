# Plan 144: Enforce the Source-Size Ceiling with a Changed-File Ratchet

> **Executor instructions:** Turn the repository's 700-line source ceiling into
> a deterministic changed-file check without forcing an all-at-once rewrite of
> grandfathered files.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- AGENTS.md package.json scripts/check.js scripts/check.test.js scripts/check-source-size.js scripts/check-source-size.test.js plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md tmp/agent-coordination`

## Status

- **Execution status:** DONE
- **Completed by:** reviewed commit `fea9163854c010416a15baedf0dee20d0583bc98`
  on `chore/enforce-source-size-ratchet`; all mandatory gates independently
  re-run and passed
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** dx / tech-debt
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`AGENTS.md` mandates a 700-line ceiling, yet `bun check` does not enforce it and
hundreds of existing files exceed it. A changed-file ratchet prevents new debt
and stops oversized files growing while allowing incremental splits instead of
an impractical repository-wide rewrite.

## Current state

- `AGENTS.md:135-143` sets the cross-language 700-line ceiling and earlier split
  thresholds.
- `scripts/check.js:224` begins the canonical check registry; it has no
  source-size gate.
- Existing examples include the 3,311-line Tasks edit dialog and 2,964-line
  Flutter task-board cubit, so an absolute whole-tree failure is unusable.
- A Rust-only ratchet is already deferred in the ledger; this plan supersedes
  that narrower idea with one cross-language contract.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `node --test scripts/check-source-size.test.js scripts/check.test.js` | all cases pass |
| Direct clean run | `bun check:source-size` | exit 0 on unchanged checkout |
| Script suite | `bun test:scripts` | all pass |
| Repository | `bun check` | source-size appears and all gates pass |
| Package JSON | `python3 -m json.tool package.json >/dev/null` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Required skills and preflight

Read the nearest `AGENTS.md`, then load `$tuturuuu-development-tooling` for the
root validator and durable policy reference, `$tuturuuu-agent-coordination` for
the shared dirty checkout/worktree protocol, and `$tuturuuu-commit` before any
staging or commit. Inspect active top-level coordination notes and STOP if one
claims an exact in-scope path. Create the isolated worktree at the planned SHA
and run `bun setup` immediately; restore setup-only lockfile drift.

## Scope

**In scope:** new `scripts/check-source-size.js` and test; `scripts/check.js` and
its test; root `package.json`; the source-size paragraph in `AGENTS.md`; focused
development-tooling reference; README status.

**Out of scope:** splitting existing source files, CI workflow YAML, generated
files, changing the 700-line threshold, dependency changes, formatting unrelated
files.

## Git workflow

Use `chore/enforce-source-size-ratchet`, run `bun setup`, and commit
`chore(tooling): enforce source size ratchet`. Claim/release the commit window.

## Steps

### Step 1: Specify changed-source discovery

Create pure helpers and fixtures covering: committed branch changes against the
merge base; staged; unstaged; deleted; renamed; and untracked files. Recognize
authored source extensions used by the repo (`ts`, `tsx`, `js`, `jsx`, `mjs`,
`cjs`, `rs`, `dart`, `py`, `sql`, `sh`) and exclude only vendored/generated
output by exact path/suffix rules: any component equal to `node_modules`,
`.next`, `target`, `dist`, `coverage`, or `.worktrees`; the exact generated DB
type `packages/types/src/supabase.ts`; basename `routeTree.gen.ts`; and Dart
suffixes `.g.dart`, `.freezed.dart`, and `.gen.dart`.
Authored migrations, tests, and fixtures remain covered because the root policy
applies to all languages. Normalize paths and count physical lines consistently.

**Verify:** focused tests prove every discovery source, spaces/brackets in paths,
renames, deletion, binary/non-source exclusion, and generated exclusions.

### Step 2: Implement the ratchet contract

For each changed authored source file: fail a new file above 700 lines; fail an
existing file now above 700 only when its physical line count is greater than
the merge-base version; fail a file that crosses from at/below 700 to above it;
allow unchanged/shrinking grandfathered files. Define physical lines as zero for
an empty file, otherwise the count of LF separators plus one only when the final
byte is not LF (CRLF is one line separator).

Resolve the comparison base in this exact order: CLI `--base <sha>`;
`SOURCE_SIZE_BASE_SHA`; `merge-base HEAD origin/$GITHUB_BASE_REF` when
`GITHUB_BASE_REF` is set; otherwise `merge-base HEAD origin/main` when that is
not HEAD; otherwise `HEAD^` for a committed HEAD with a parent. Independently
union staged, unstaged, and untracked source paths so local work is never hidden
by the committed base. Fail closed with an actionable diagnostic when committed
comparison is needed but no base resolves; never fetch or mutate Git state.

**Verify:** focused tests cover 699/700/701 boundaries, new/grew/shrank cases,
multiple files, deterministic diagnostics, and unresolved base.
Also cover CRLF, trailing newline, no trailing newline, every base-resolution
branch, and committed plus dirty-path union/deduplication.

### Step 3: Make the policy mechanically precise

Update only the existing source-size paragraph in `AGENTS.md` and the matching
development-tooling reference: the hard 700-line ceiling applies to new files;
already-oversized authored files are grandfathered only while they do not grow,
and should shrink when substantially edited. State that tests and migrations are
authored source and that generated/vendor files are excluded. Preserve the
earlier 200/400-line split guidance as review guidance, not a gate.

**Verify:** `rg -n "700|grandfathered|generated" AGENTS.md plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md` finds the aligned contract in both locations.

### Step 4: Register the canonical gate

Add `check:source-size` to `package.json` and invoke it as a named check in
`scripts/check.js`. Extend `scripts/check.test.js` to prove it is registered,
runs in the normal gate, and reports failure. Register the focused test in
`test:scripts`. Keep the check independent of workflow YAML.

**Verify:** focused tests and `bun check:source-size` pass on the current
checkout; an isolated fixture with a new 701-line file fails with its path and
line count.

### Step 5: Run all gates

Run the focused tests, full script suite, `bun check`, JSON validation, and
whitespace. Confirm no baseline dump or unrelated generated diff was created.

## Done criteria

- [ ] New authored source above 700 lines fails deterministically.
- [ ] Oversized grandfathered source may shrink but may not grow.
- [ ] Staged, unstaged, untracked, rename, and CI committed changes are covered.
- [ ] Generated/vendor exclusions are explicit and tested.
- [ ] `bun check` runs the gate; all commands pass.

## STOP conditions

Stop if an active note claims any exact tooling path, the repository cannot
resolve a stable merge base without network mutation, generated classification
requires a broad unreviewed allowlist, `bun check` orchestration has drifted, or
a gate fails twice.

## Maintenance notes

Prefer extracting an oversized file over adding an exclusion. Any new generated
suffix must get a fixture proving why it is not authored source. Lowering the
ceiling is a separate policy decision.
