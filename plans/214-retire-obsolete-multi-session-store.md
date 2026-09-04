# Plan 214: Retire the Obsolete Browser Multi-Session Store

> **Executor instructions:** Prove the package entrypoint has no consumer,
> delete the unsafe localStorage authority and stale implementation document,
> and preserve the live server-vault account switcher including legacy-key
> cleanup.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- packages/auth/src/multi-session packages/auth/src/index.ts packages/auth/package.json apps/web/SECURE_EMAIL_IMPLEMENTATION.md apps/web/src/context/account-switcher-context.tsx apps/web/src/__tests__/account-switcher-context.test.tsx tmp/agent-coordination`

## Status

- **Execution status:** TODO — transplant the retained scoped diff into a fresh
  worktree at verified integrated main `cdef1c5533`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** architecture / auth cleanup / dead code
- **Depends on:** Plan 216 (DONE at final corrective commit `3a09b070ab`,
  integrated in `cdef1c5533`)
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

The private auth package still exposes a 1,980-line browser session store whose
own comments call its localStorage fallback vulnerable/development-only. The
live account switcher uses typed server vault APIs, deliberately deletes the
legacy key, and has no import of this store. Leaving the module exported makes
an obsolete unsafe design look supported.

The retained worktree `.worktrees/cycle32-plan214` contains exactly the planned
deletions/export cleanup. Reachability and absence pass; live account-switcher
hashes are unchanged; focused tests pass (23 passed, 1 skipped); auth and Web
typechecks pass. The serialized Web build made no progress for more than five
minutes on its first attempt. Its permitted host retry then failed at unchanged
`packages/utils/src/i18n-root-locale.ts:2` with Next's `root-params` invalid-
import/missing-`locale` contract. Per STOP, `bun check`, final whitespace,
staging, and commit were not run. Preserve the worktree until the base build
blocker is repaired. Plan 216 has since repaired and verified that contract in
final corrective commit `3a09b070ab`, integrated in verified main
`cdef1c5533`; transplant only the retained scoped diff into a fresh worktree at
that exact main before rerunning the remaining build/repository gates.

## Current state and exact contract

- Repository search finds no consumer of the subpath, root symbols, store
  factory, or stored-account email type outside the module and stale document.
- Delete `packages/auth/src/multi-session/**`, remove `./multi-session` from the
  package export map, and remove its root re-export from `src/index.ts`.
- Delete `apps/web/SECURE_EMAIL_IMPLEMENTATION.md`; it describes the retired
  store rather than the live server-vault account switcher.
- Preserve `account-switcher-context.tsx` byte-for-byte, especially its one-time
  removal of `tuturuuu_multi_session_store` and reauthentication behavior.
- Because the manifest export is a normal source edit rather than a dependency
  change, edit only that export key; do not run a package-manager mutation or
  change versions.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root/Web/package AGENTS files. Treat
`.worktrees/cycle32-plan214` as a read-only patch source: verify HEAD
`52f4aa1b12`, no staged changes, and only the Scope paths; export those paths
with `git diff --binary HEAD -- <the exact Scope paths>` to
`/private/tmp/plan-214-cdef.patch`. Do not stash, rebase, cherry-pick, reset, or
mutate that divergent worktree. Create fresh branch/worktree
`chore/retire-multi-session-store-cdef` at `cdef1c5533`, run `bun setup`
immediately, restore setup-only lock drift, then `git apply --check` and apply
the patch. Verify exact path/content parity before deleting the temporary patch.
Preserve the old worktree until the new commit is integrated; then remove both
completed worktrees/branches under the post-merge cleanup rule.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Scoped transplant | `git diff --name-only HEAD -- packages/auth/src/multi-session packages/auth/src/index.ts packages/auth/package.json apps/web/SECURE_EMAIL_IMPLEMENTATION.md` | exactly the planned module/document deletions and two export edits before patch export and after apply |
| Reachability | `rg -n '@tuturuuu/auth/multi-session|createSessionStore|SessionStore|getAccountsWithEmail|StoredAccountWithEmail' . --glob '!packages/auth/src/multi-session/**' --glob '!apps/web/SECURE_EMAIL_IMPLEMENTATION.md' --glob '!plans/**' --glob '!tmp/agent-coordination/**'` | no matches before deletion; any supported consumer is a STOP |
| Absence/exports | `test ! -e packages/auth/src/multi-session && test ! -e apps/web/SECURE_EMAIL_IMPLEMENTATION.md && ! rg -n 'multi-session' packages/auth/src/index.ts packages/auth/package.json` | exit 0 |
| Focused regression | `bun --cwd apps/web vitest run src/__tests__/account-switcher-context.test.tsx src/__tests__/account-switcher-modal.test.tsx` | server-vault switching and legacy-key cleanup pass |
| Auth/Web | `bun run --cwd packages/auth type-check && bun run --cwd apps/web type-check && bun run --cwd apps/web build` | all exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** delete the multi-session directory and stale Web document; remove
the root/subpath exports; focused account-switcher regression tests as read-only
gates. **Out of scope:** editing the live account switcher, server vault/session
RPCs, app-session tokens, auth package dependencies/version, translations,
database, route manifests, or adding a replacement implementation.

## Steps

1. Run the reachability command plus package/build-config searches. Verify the
   live account switcher has no dynamic/string import and record the exact
   directory/file baseline. Any consumer is a STOP.
2. Delete the closed module and stale document; remove only its two package
   exports. Repeat reachability/absence checks and verify the live context has
   zero diff.
3. Run focused account-switcher tests, auth/Web typechecks, the Web production
   build, repository, whitespace, and final scope gates.

## Done criteria

- [ ] The obsolete module, root/subpath exports, and stale document are absent.
- [ ] No source/config/package consumer references the retired API.
- [ ] The live server-vault switcher and legacy-key cleanup are unchanged and
  tested.
- [ ] Auth/Web typechecks, Web build, repository, and whitespace gates pass.

## STOP conditions

Stop on any supported/static/dynamic consumer, a public-registry contract,
required live-switcher edit, unexpected manifest change, ownership conflict, or
any mandatory gate failing twice.
