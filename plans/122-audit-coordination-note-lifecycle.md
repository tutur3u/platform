# Plan 122: Audit Coordination Notes Against the Canonical Lifecycle

> **Executor instructions:** Add a read-only coordination-note auditor that
> parses the formats agents actually write, reports lifecycle debt precisely,
> and offers a strict mode for clean environments. Do not rewrite, archive, or
> normalize another agent's note.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- AGENTS.md package.json scripts/git-commit-window.js scripts/git-commit-window.test.js scripts/coordination-notes.js scripts/coordination-notes.test.js plugins/tuturuuu/skills/tuturuuu-agent-coordination tmp/agent-coordination`
> Stop on coordination-policy, root-script, or exact tooling ownership drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `857139df10c33c7e1282c6e10c70842ff73c3a95`
  on branch `chore/coordination-note-audit`; 15 focused tests, 1,255 script
  tests, plugin validation, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** DX / Coordination tooling
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Root policy treats missing and noncanonical statuses as active ownership and
requires completed notes to leave the top-level directory. Today every advisor
or executor must rediscover lifecycle debt by hand before deciding whether a
path is available. A read-only, fixture-tested audit command makes that state
deterministic without letting one agent mutate another agent's handoff.

## Current state

- `AGENTS.md:248-257` requires Agent, Intent, Owned paths, Observed dirty paths,
  Status, Needs, Verification, Risks, and Commit window; status must be exactly
  `working`, `blocked`, `handoff`, or `done`, and top-level `done` notes must be
  archived.
- `tmp/agent-coordination/20260629-134624-codex-cron-runner-recovery.md:14`
  uses noncanonical `complete` while still claiming broad Web and script paths.
- `tmp/agent-coordination/20260727-154500-codex-richfield-bilingual-admin.md:17`
  uses noncanonical `partial`.
- `tmp/agent-coordination/20260703-184620-claude-calendar-app-migration.md:4`
  is canonical `done` but remains top-level.
- A read-only 2026-08-10 inventory found 62 top-level Markdown notes: six with
  standalone canonical `done`, five with noncanonical status values, and
  thirteen without a standalone Status field. Counts are diagnostic snapshots,
  not hard-coded test expectations.
- `scripts/git-commit-window.js` and `scripts/git-commit-window.test.js` are the
  nearest root-script exemplar: dependency-injected filesystem/clock seams,
  explicit exit codes, exported parsing functions, temporary-directory
  fixtures, and a thin CLI entry point.
- No `scripts/` command currently validates coordination-note fields or
  lifecycle placement.

## Required skills and preflight

Load `$tuturuuu-development-tooling` and `$tuturuuu-agent-coordination`. Read
root policy and the tooling reference before editing. Recheck that no active
note owns the exact new script/test or the named package/skill lines. Never
stage files under `tmp/agent-coordination`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `node --test scripts/coordination-notes.test.js` | parser, report, strict-mode, and fixture cases pass |
| Current audit | `bun coordination:audit` | exits 0 and reports current debt without changing notes |
| Script registry | `bun test:scripts` | canonical root script suite passes and includes the new test |
| Repository gate | `bun check` | exits 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `scripts/coordination-notes.js` (create)
- `scripts/coordination-notes.test.js` (create)
- `package.json` only for `coordination:audit` and `test:scripts` registration
- `AGENTS.md` coordination section only for the new read-only command and exit
  semantics
- `plugins/tuturuuu/skills/tuturuuu-agent-coordination/SKILL.md` and its focused
  reference only if required to keep the documented preflight aligned
- `plans/README.md` only for status

Do not edit, move, archive, reformat, or stage any existing coordination note.
Do not add dependencies, modify `bun.lock`, enforce strict mode inside
`bun check`, or turn ignored coordination notes into tracked repository files.

## Git workflow

- Branch: `chore/coordination-note-audit` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `chore(coordination): audit note lifecycle`.
- Do not push or open a PR unless instructed. Claim the commit window before
  staging and never stage coordination notes.

## Steps

### Step 1: Define one explicit note parser

Export a pure parser that accepts note text plus its relative path. Recognize
only standalone field lines in the established plain form (`Status: working`)
or bulleted bold form (`- **Status:** working`). Required field names are the
nine root-policy names; field order may vary. Normalize whitespace, but do not
coerce synonyms such as `complete`, `partial`, or `in progress` into canonical
states.

Return structured diagnostics for missing fields, duplicate fields,
noncanonical status, malformed owned-path sections, and a canonical `done`
note left at top level. Diagnostics must contain paths and field names, never
note bodies or possible credential values.

**Verify:** focused parser tests cover both supported formats, mixed field
order, missing/duplicate fields, every canonical status, the known synonym
examples, top-level `done`, and archived `done`.

### Step 2: Add report and strict CLI modes

Model the CLI/library split and injected filesystem seam after
`scripts/git-commit-window.js`. Default `audit` scans only top-level
`tmp/agent-coordination/*.md`, prints deterministic counts plus one diagnostic
line per file, and exits zero so current historical debt does not break every
developer's `bun check`. `audit --json` emits a stable machine-readable object.
`audit --strict` exits nonzero when any diagnostic exists, for clean fixtures
and future owner-led cleanup gates.

Never scan note contents for arbitrary patterns or echo full field values.
Exclude the JSON commit-window lock and the `archive/` tree from top-level debt;
archived notes may be parsed in tests to prove that canonical `done` placement
is accepted.

**Verify:** CLI tests use temporary roots and injected stdout/stderr. They prove
deterministic ordering, zero/nonzero exit behavior, JSON shape, empty directory,
and absence of note-body echoing.

### Step 3: Register and document the read-only preflight

Add `coordination:audit` to root scripts and register the focused Node test in
`test:scripts`. Document that agents should run the audit when ownership is
ambiguous, that default mode reports legacy debt without granting ownership,
and that only each note's owner or an explicitly authorized operator may fix or
archive it. State that a reported noncanonical/missing note remains active
under existing policy.

Do not add strict mode to `bun check` yet: current local notes intentionally
contain historical debt, and ignored note inventories differ between clones.
A later operator-led cleanup can enable prospective enforcement once strict
mode passes in the intended shared environment.

**Verify:** `bun coordination:audit` reports the current directory without
modification; `git status --short tmp/agent-coordination` is unchanged from the
preflight inventory.

### Step 4: Run all gates and inspect scope

Run every command in the table. Confirm `git diff --name-only` contains only the
declared script, documentation, package-script, and plan-status paths. Confirm
`bun.lock` and every coordination note are unchanged.

## Test plan

- Parser fixtures: plain, bulleted-bold, missing, duplicate, noncanonical,
  inline/non-standalone status, top-level done, archived done.
- CLI fixtures: empty root, mixed notes, deterministic human report, JSON
  report, strict failure, default success, inaccessible file error.
- Safety assertion: diagnostic output includes filename and field/status class
  only; a synthetic sensitive field value placed elsewhere in a fixture never
  appears in stdout/stderr.
- Model structure after `scripts/git-commit-window.test.js`; use `node:test`,
  `node:assert/strict`, and `mkdtempSync` cleanup.

## Done criteria

- [ ] One tested parser recognizes the two documented field syntaxes without
      accepting status synonyms.
- [ ] Default audit reports current debt read-only; strict mode fails on the
      same diagnostics in fixtures.
- [ ] Top-level canonical `done`, missing fields, and noncanonical statuses are
      individually visible and machine-readable.
- [ ] No existing coordination note, archive entry, lockfile, or dependency is
      modified.
- [ ] Focused tests, `test:scripts`, `bun check`, and whitespace pass.

## STOP conditions

Stop if policy owners want coordination notes tracked in Git, require automatic
cross-owner rewrites/archives, or require strict enforcement before the current
shared inventory can pass. Stop on exact root-tooling ownership or if the
ignored-note lifecycle differs materially from the current shared-worktree
model; report the desired authority/state model instead of inventing it.

## Maintenance notes

The parser defines syntax, not ownership. A clean report never grants an agent
permission to edit someone else's paths. Keep human and JSON diagnostics stable
if future dashboards consume them, and add strict enforcement only after an
explicit owner-led cleanup establishes a portable baseline.
