# Plan 194: Make Documentation Contribution Links Executable

> **Executor instructions:** Correct the three broken internal links and the
> nonexistent index-page workflow, then add a focused read-only regression test.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/docs/README.md apps/docs/build/development-tools/documenting.mdx apps/docs/docs.json scripts tmp/agent-coordination`

## Status

- **Execution status:** DONE — reviewed commit `e539356d39` on
  `docs/fix-contribution-links`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** docs / DX / tests
- **Depends on:** Plan 004 (DONE); exact docs paths are currently unclaimed
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  004 commit `558397b971`

## Why this matters

The canonical contributor README links to nonexistent `/build/index` and
`/platform/index` pages and tells authors to update nonexistent `index.mdx`
files. The detailed documentation guide also links to a nonexistent relative
organization guide. These are the entry points intended to teach contributors
how to avoid navigation drift.

## Current state

- `apps/docs/README.md:88-99` prescribes `index.mdx`, `/build/index`, and
  `/platform/index`; none exists.
- `apps/docs/build/development-tools/documenting.mdx:92-107` links
  `../organization-guide`, which resolves under `build/` and does not exist.
- `apps/docs/docs.json:19-30,267-300` registers the actual pages as
  `overview/organization-guide`, `platform/overview`, and `build/overview`.
- All 208 `docs.json` page entries currently resolve; the regression check must
  validate Markdown/MDX internal links without treating external URLs, anchors,
  or image assets as pages.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-development-tooling`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root and docs instructions. Confirm no active note
claims the two content files or the selected focused-test path. Use an isolated
worktree from `558397b971` and run `bun setup` immediately so automatic root
script-test discovery is present without editing `package.json`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `node --test scripts/docs-contribution-links.test.js` | registered pages and supported internal content links resolve |
| Script discovery | `bun test:scripts --list` | the new focused test is listed, or the chosen existing canonical docs test is listed |
| Docs navigation | `python3 -m json.tool apps/docs/docs.json` | valid JSON; no navigation edit required |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** `apps/docs/README.md`;
`apps/docs/build/development-tools/documenting.mdx`; create
`scripts/docs-contribution-links.test.js`.

**Out of scope:** rewriting docs content; external-link crawling; docs UI;
navigation redesign; changing `docs.json` page order; production deployment.

## Git workflow

Use `docs/fix-contribution-links` and commit
`docs: fix contribution navigation links`. Claim/release the commit window; do
not push or open a PR.

## Steps

1. Add a focused red test that parses `docs.json` page strings and supported
   internal Markdown/MDX links in the two contribution guides. Resolve absolute
   docs paths from `apps/docs`, relative links from the source directory, strip
   anchors/query strings, and ignore external/mail/image links. **Verify:** the
   focused test fails on exactly the three stale targets before docs edits.
2. Replace `/build/index` with `/build/overview`, `/platform/index` with
   `/platform/overview`, and the bad relative organization link with the
   canonical `/overview/organization-guide`. Replace the `index.mdx` instruction
   with the actual `docs.json` navigation workflow and appropriate overview-page
   cross-linking. **Verify:** focused test passes and exact searches find none of
   the retired targets/instructions.
3. Ensure the test is discovered by Plan 004's canonical script suite without
   changing the root manifest. Run docs JSON, repository, and whitespace gates.

## Done criteria

- [ ] All three contribution links resolve to registered pages.
- [ ] The add-page instructions name `docs.json`, not nonexistent index files.
- [ ] A read-only regression test catches missing registered pages and broken
      supported internal links without network access.
- [ ] Focused, discovery, docs JSON, repository, and whitespace gates pass.
- [ ] Only the scoped docs/test/registration paths are modified.

## Execution result

Completed in the clean isolated worktree
`.worktrees/docs-fix-contribution-links`. The focused test recorded the required
red phase on exactly three stale targets, then passed 2/2 after the docs edits.
Plan 004 discovery listed the new test among 98 files; docs JSON, scoped Biome,
`bun check`, and whitespace gates passed. Commit
`e539356d3910152193b87ea2b762ac32258af03a` changes exactly the two docs files
and `scripts/docs-contribution-links.test.js`; no push or PR was created.

## STOP conditions

Stop on active ownership, a docs framework rule that changes path resolution,
more broken links requiring broader content ownership, the Plan 004 execution
base missing automatic discovery, root-manifest changes, environment
build/bundling needs, or any
mandatory gate failing twice.
