# Plan 215: Retire the Orphaned Web EPM Implementation

> **Executor instructions:** Preserve Web's three CMS redirect routes and their
> redirect tests, delete only the closed 30-file implementation/test graph
> behind them, and leave CMS and TanStack behavior unchanged.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm' 'apps/cms/src/app/[locale]/(dashboard)/[wsId]/content' 'apps/tanstack-web/src/routes/$locale/$wsId/epm.tsx' tmp/agent-coordination`

## Status

- **Execution status:** TODO — transplant the retained deletion diff into a
  fresh worktree at verified main `cdef1c5533`; exact-main Web build is green
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** architecture / satellite cutover / dead code
- **Depends on:** none; CMS paths are read-only evidence
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

Web's EPM subtree contains 10,769 lines even though every reachable page now
redirects to CMS and TanStack does the same. Only the three redirect pages and
their tests are live; the remaining 30 files/10,628 lines form a self-contained
implementation and test graph that can drift from the canonical CMS studio.

The retained worktree `.worktrees/refactor-retire-web-epm-implementation`
contains the exact 30-file/10,628-line deletion. The six redirects remain;
their three focused tests pass; Web typecheck passes; CMS and TanStack have zero
diff. After coordinator build serialization, both clean Web build attempts hung
for at least five minutes at `Creating an optimized production build ...` with
no output or `.next` artifact progress and were interrupted under the shared
definitive threshold. Per STOP, `bun check`, final staging, and commit were not
run. Setup-generated `bun.lock` drift remains out of scope and must be restored
before any future commit attempt. The repository-wide release closeout later
completed a real Web production build on exact integrated main `cdef1c5533`, so
the base build control is green. Transplant only the retained scoped deletion
into a fresh worktree at that exact main and rerun the plan gates rather than
replaying the deletion.

## Current state and exact contract

- Preserve exactly these six files:
  `epm/page.tsx`, `epm/page.test.tsx`,
  `epm/collections/[collectionId]/page.tsx`, its `page.test.tsx`,
  `epm/entries/[entryId]/page.tsx`, and its `page.test.tsx`.
- Delete every other tracked file under that EPM subtree (30 files at the
  planned commit). Do not move, re-export, or copy any implementation.
- The three pages must keep their current CMS origin/path/query behavior and the
  three tests must remain byte-for-byte unchanged.
- CMS's collection/entry implementation and TanStack's EPM redirect are
  canonical read-only evidence and must have zero diff.
- Add no dependency cleanup in this plan; report newly unused dependencies for
  a separate package-manager change.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root/Web/CMS AGENTS files. Treat
`.worktrees/refactor-retire-web-epm-implementation` as a read-only patch source:
verify HEAD `52f4aa1b12`, no staged changes, and the exact 30 deleted files plus
only out-of-scope setup `bun.lock` drift. Export only the EPM subtree with
`git diff --binary HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm'`
to `/private/tmp/plan-215-cdef.patch`; never include `bun.lock`. Do not stash,
rebase, cherry-pick, reset, or mutate the divergent worktree. Create fresh
branch/worktree `refactor/retire-web-epm-implementation-cdef` at `cdef1c5533`,
run `bun setup` immediately, restore setup-only lock drift, then `git apply
--check` and apply the patch. Verify exactly 30 deletions/10,628 lines and no
redirect/CMS/TanStack diff before deleting the temporary patch. Preserve the
old worktree until the new commit is integrated; then remove both completed
worktrees/branches under the post-merge cleanup rule.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Scoped transplant | `git diff --name-only HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm'` | exactly the 30 planned deleted paths before patch export and after apply; never `bun.lock` |
| Baseline | `find 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm' -type f | sort && wc -l $(find 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm' -type f)` | 36 files/10,769 total lines at planned commit; classify six retained and 30 deleted |
| Reachability | `rg -n 'EpmClient|useEpmStudio|EntryDetailClient|epm-client|epm-dialogs|epm-media-upload|resilient-media-image' apps/web/src --glob '!apps/web/src/app/[locale]/(dashboard)/[wsId]/epm/**'` | no external match; any consumer is a STOP |
| Retained set | `find 'apps/web/src/app/[locale]/(dashboard)/[wsId]/epm' -type f | sort` | exactly the six named redirect files after deletion |
| Focused redirects | `bun --cwd apps/web vitest run 'src/app/[locale]/(dashboard)/[wsId]/epm/page.test.tsx' 'src/app/[locale]/(dashboard)/[wsId]/epm/collections/[collectionId]/page.test.tsx' 'src/app/[locale]/(dashboard)/[wsId]/epm/entries/[entryId]/page.test.tsx'` | all redirect contracts pass |
| Types/build | `bun run --cwd apps/web type-check && bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** deletion of exactly the 30 nonredirect EPM implementation/test
files. **Read-only evidence:** six retained files, CMS canonical pages, TanStack
redirect, history/ownership notes. **Out of scope:** editing redirects/tests,
CMS/TanStack, APIs, messages, dependencies/lockfile, navigation, route manifests,
or replacing EPM functionality.

## Steps

1. Inventory all 36 files, run the external reachability search plus dynamic/
   config/string searches, and verify the six named files are the only route
   entries. Any external consumer is a STOP.
2. Delete the other 30 files. Verify the retained set and zero diff for the six
   redirect files, all CMS paths, and TanStack's redirect.
3. Run focused redirects, Web typecheck/build, repository, whitespace, and final
   30-file/10,628-line scope audit.

## Done criteria

- [ ] Exactly the 30 orphaned files/10,628 lines are absent.
- [ ] Exactly six Web redirect files remain and are unchanged.
- [ ] CMS and TanStack have zero diff and no external importer is stranded.
- [ ] Focused redirects, Web typecheck/build, repository, and whitespace pass.

## STOP conditions

Stop on any external/dynamic/config consumer, file-count drift, redirect/CMS/
TanStack edit, required dependency mutation, ownership conflict, or a mandatory
gate failing twice.
