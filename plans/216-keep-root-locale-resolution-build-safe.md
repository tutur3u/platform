# Plan 216: Keep Root-Locale Resolution Build-Safe

> **Executor instructions:** Repair the shipped cross-app locale helper without
> undoing the locale validation contract. Keep `next/root-params` confined to
> supported Server Component call sites; next-intl request configuration must
> resolve its locale from the request-config parameters that next-intl owns.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- packages/utils/src/i18n-root-locale.ts packages/utils/src/i18n-root-locale.test.ts apps/*/src/i18n/request.ts apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/next-root-params.md`

## Status

- **Execution status:** DONE — final corrective commit `3a09b070ab` is
  integrated in verified `origin/main` `cdef1c5533`
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / build / i18n
- **Depends on:** none
- **Planned at:** commit `52f4aa1b12`, 2026-08-11

## Completion evidence

- The initial reviewed chain removed `next/root-params` from the shared
  request-config dependency graph, updated all 26 next-intl request
  configurations, and added focused helper plus repository-contract coverage.
- Production-build verification then proved that request configuration needs a
  prerender-safe default-locale fallback while actual locale root layouts must
  remain strict. Final corrective commit `3a09b070ab` split those contracts into
  `resolveRequestLocale` and `resolveRootLocale`; that is the shipped behavior.
- Focused helper/contract tests, Utils/Web/Tasks typechecks, `bun check`, and a
  full Web production build (747/747 pages) passed. The Tasks host build later
  reached the known Turbopack CSS-worker port restriction rather than the
  retired root-params failure; exact-main CI for the integrated commits passed.
- Plans 208, 214, and 215 are therefore unblocked for retained-worktree replay.
  They must incorporate verified integrated main `cdef1c5533` rather than
  reimplementing this fix.

## Why this matters

Commit `52f4aa1b12` made 26 next-intl request configurations import a shared
helper that statically imports `next/root-params`. Next 16.3 documents that
module as Server-Component-only, while next-intl request configuration can run
in route/middleware compilation. The retained Plan 208 and Plan 214 worktrees
both reached the same production-build failure at
`packages/utils/src/i18n-root-locale.ts:2`; Plan 208's host retry reproduced it.
This is a shipped fleet-wide build regression and blocks otherwise-green work.

## Planned-base state and final contract

- At the planned base, `packages/utils/src/i18n-root-locale.ts` statically imported
  `next/root-params` and falls back to `rootParams.locale()`.
- At that base, all 26 callers were `apps/*/src/i18n/request.ts`; they
  destructured next-intl's optional explicit `locale` but ignored
  `requestLocale`. Final main routes all 26 through `resolveRequestLocale`.
- next-intl 4.13's `GetRequestConfigParams` documents `locale` as an explicit
  server-function override and `requestLocale` as the matched locale segment.
- Next 16.3's local API reference says `next/root-params` cannot be used in
  Route Handlers. Do not hide the import behind a dynamic import; remove it
  from the request-config dependency graph.
- Preserve the final split contract: request configuration uses an explicit
  valid locale when supplied and otherwise a valid `requestLocale`, falling
  back to the app's configured default for missing or invalid prerender
  candidates. Actual locale root layouts remain strict and call `notFound()`
  for missing or unsupported locale segments.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, `$using-git-worktrees`, and
`$vercel-react-best-practices`. Read root and nearest app/package AGENTS files
plus the local Next root-params reference cited above. Create an exact-base
isolated worktree, run `bun setup` immediately, and restore setup-only lockfile
drift before editing. No active exact-path owner was found at planning time.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg --sort path -l 'resolveRequestLocale\(' apps --glob '**/src/i18n/request.ts'` | exactly the 26 locale-rooted request files listed by the current tree |
| Focused test | `bun --cwd packages/utils vitest run src/i18n-root-locale.test.ts` | request/default fallback and strict root-locale cases pass |
| Boundary | `! rg -n "next/root-params" packages/utils/src/i18n-root-locale.ts apps/*/src/i18n/request.ts` | exit 0; no unsupported import in request configuration |
| Typecheck | `bun run --cwd packages/utils type-check && bun run --cwd apps/web type-check && bun run --cwd apps/tasks type-check` | all exit 0 |
| Builds, serialized | `bun run --cwd apps/web build` then `bun run --cwd apps/tasks build` | both production builds exit 0; never run them concurrently |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**Original executor scope:** `packages/utils/src/i18n-root-locale.ts` and its
test; the 26 existing `apps/*/src/i18n/request.ts` callers. **Reviewed follow-up
scope:** the 26 locale root layouts plus the next-intl setup validator/test and
architecture guidance required by the production-build regression. **Out of
scope:** pages,
translations, routing tables/default locales, Shortener's non-locale root,
Next/next-intl versions, dependencies, route handlers/manifests, and retained
Plan 208/214/215 worktrees.

## Steps

1. Make the focused helper test red for separate request-config and root-layout
   contracts. Neither helper may import or call root params.
2. In every inventoried request file, resolve
   `localeOverride ?? (await requestLocale)` through `resolveRequestLocale` and
   the app's configured default. Keep `resolveRootLocale` strict for actual
   locale root layouts. Preserve each app's messages/formats response
   byte-for-byte.
3. Run the boundary search, focused test, representative typechecks, and the
   Web then Tasks builds serially. Run `bun check`, whitespace, and exact-scope
   review before a scoped commit.

## Done criteria

- [x] Request configuration has no static or dynamic `next/root-params` import.
- [x] Explicit valid locale overrides still win; valid request locales resolve;
      bad and absent request candidates fall back to the configured default;
      strict root-layout candidates still call `notFound()`.
- [x] All 26 callers use the same tested boundary without message/format drift.
- [x] Focused tests, Utils/Web/Tasks typechecks, Web production build,
      `bun check`, whitespace, and exact-main CI gates pass; the remaining local
      Tasks build failure is the documented host CSS-worker restriction.
- [x] Plans 208, 214, and 215 may now be replayed only by resuming their retained
      worktrees atop verified integrated main `cdef1c5533`; do not edit their
      source here.

## STOP conditions

Stop on caller-count drift, a non-request-config caller that truly requires
root params, any need to change routing/default-locale semantics, an ownership
conflict, or any mandatory gate failing twice after one reasonable scoped fix.
