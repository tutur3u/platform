# Plan 042: Require Confirmation for Hive Browser-State Recovery

> **Executor instructions:** Follow the established Web method/origin safety
> contract while retaining Hive's narrower site-data and cookie scope: GET is
> non-destructive; only a same-origin POST may clear Hive browser state.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/hive/src/app/~recover-browser-state apps/web/src/app/~recover-browser-state/route.ts apps/hive/src/lib/hive-public-url.ts apps/hive/messages/en.json apps/hive/messages/vi.json`
> Stop if the Web recovery contract or Hive public-origin helper materially changed.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Hive production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating an
  internal process/port; uncommitted reviewed work remains in
  `.worktrees/fix-hive-browser-recovery-confirmation`
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / CSRF / Session integrity
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Hive currently clears browser storage and auth cookies on every GET. An
external navigation, prefetcher, redirect, or scanner can therefore log a user
out without confirmation.

## Current state

- `apps/hive/src/app/~recover-browser-state/route.ts:20-37` redirects, adds
  `Clear-Site-Data`, and expires matching auth cookies unconditionally on GET.
- Its route test codifies that destructive GET behavior.
- `apps/web/src/app/~recover-browser-state/route.ts:24-100` is the maintained
  exemplar: GET returns a no-store confirmation form; POST rejects requests
  whose Origin/Referer is not same-origin, then clears state and redirects.
- Hive must continue using `createHivePublicUrl` for its final login redirect.
- Retain Hive's current `Clear-Site-Data` value (`cache`, `storage`, and
  `executionContexts`, excluding broad `cookies`) and explicitly expire only
  matching Supabase auth cookies.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
Hive ownership notes and the current locale resolution used by unlocalized
routes before editing. Add all confirmation copy to both message bundles; do
not hard-code English UI text.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `bun --cwd apps/hive vitest run 'src/app/~recover-browser-state/route.test.ts'` | all cases pass |
| Sort messages | `bun i18n:sort` | message bundles are sorted |
| Hive typecheck | `bun run --cwd apps/hive type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Hive build | `bun run --cwd apps/hive build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/hive/src/app/~recover-browser-state/route.ts`
- `apps/hive/src/app/~recover-browser-state/route.test.ts`
- `apps/hive/messages/en.json` and `apps/hive/messages/vi.json`

Do not alter login/session issuance, proxy behavior, cookie naming, other apps'
recovery routes, or introduce a shared package in this small fix.

## Git workflow

- Branch: `fix/hive-browser-recovery-confirmation` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(hive): confirm browser state recovery`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Make GET harmless

Return a minimal localized HTML confirmation form posting to
`/~recover-browser-state`. Resolve `NEXT_LOCALE` from the request cookies,
allowlist it against `apps/hive/src/i18n/routing.ts::routing.locales`, fall back
to `routing.defaultLocale`, and load a dedicated namespace with
`getTranslations({ locale, namespace })`. HTML-escape translated values before
interpolation. Apply no-store headers, but do not set `Clear-Site-Data`, expire
cookies, or redirect.

### Step 2: Gate destructive POST

Implement the Web route's exact Origin-first, Referer-fallback same-origin
check. Reject missing, malformed, or cross-origin evidence with 403 and
no-store only. On success, redirect with `createHivePublicUrl`, apply Hive's
existing non-cookie `Clear-Site-Data` value, and expire only matching Supabase
auth cookies.

### Step 3: Replace the unsafe test contract

Prove GET is non-destructive, same-origin Origin and Referer POSTs clear state,
and cross-origin/malformed/missing evidence cannot clear cookies or site data.

## Test plan

- GET: 200 HTML, no-store, form action present, no redirect, no
  `Clear-Site-Data`, and no expired auth cookie.
- POST: same-origin Origin and Referer fallback succeed; cross-origin,
  malformed, and missing evidence return 403 without destructive headers.
- Successful POST: preserves Hive public-host redirect behavior and expires
  only cookie names matching the Supabase auth pattern.

## Done criteria

- [ ] No GET response clears site data or auth cookies.
- [ ] Only same-origin POST performs recovery.
- [ ] Redirect and no-store behavior remain correct for Hive origins.
- [ ] English/Vietnamese copy is present and sorted.
- [ ] Focused tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if Hive intentionally supports a cross-origin recovery initiator, its
public URL helper cannot construct the login redirect safely, or the Web
exemplar has changed materially.

## Maintenance notes

Keep destructive browser/session operations off safe HTTP methods. Any future
shared extraction must preserve per-app redirect-origin handling.
