# Plan 162: Correct the Platform-Wide Satellite API Ownership Overview

> **Executor instructions:** Replace the platform overview's absolute
> central-Web claim with the current local-product-first, explicit-fallback
> ownership model. Add a focused regression assertion so this contradiction
> cannot return.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/docs/platform/overview.mdx apps/docs/platform/architecture/satellite-apps.mdx apps/database/scripts/local-supabase-docs.test.js scripts apps/docs/docs.json tmp/agent-coordination`

## Status

- **Execution status:** DONE — reviewed commit `22c96a18ef` on
  `docs/satellite-api-ownership-overview`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** docs
- **Depends on:** Plan 004 (DONE); execute from reviewed discovery commit
  `558397b971`
- **Planned at:** commit `60e33aebd9`, 2026-08-10; implementation base
  `558397b971`

## Why this matters

The highest-level platform overview says every satellite forwards `/api/*` to
Web and none owns a backend. That directly contradicts the focused architecture
guide and more than one thousand local satellite route handlers, encouraging
contributors to add duplicate handlers and use the wrong auth/migration model.

## Current state

- `apps/docs/platform/overview.mdx:20-36` says every satellite routes `/api/*`
  to Web, none owns a backend, and satellites own only UI shells.
- `apps/docs/platform/architecture/satellite-apps.mdx:24-39` correctly explains
  Forms' hard cutover and local workspace/public APIs.
- Plan 131 corrected Calendar, CMS, Finance, and Mind application pages but did
  not include the platform overview.
- The repository currently has 1,072 non-Web `src/app/api/**/route.ts` files;
  local product routes win while unmatched or explicitly central families may
  still fall back to Web.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root AGENTS and
both cited docs pages. Confirm no active note owns `platform/overview.mdx` and
create the isolated worktree from `558397b971` so root script-test discovery is
present without editing the Forms-owned root manifest. Do not modify the
Forms-owned focused architecture page unless its owner explicitly transfers
it; it is evidence, not required edit scope.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route evidence | `find apps -path '*/src/app/api/*/route.ts' -not -path 'apps/web/*' | wc -l` | nonzero local satellite route inventory |
| Focused contract | `node --test scripts/satellite-api-ownership-docs.test.js` | stale absolutes are rejected and current model is present |
| Stale phrases | `rg -ni "every satellite routes|none owns its own backend|owns only its UI|single source of truth for API routes" apps/docs/platform/overview.mdx` | no output |
| Docs navigation | `python3 -m json.tool apps/docs/docs.json` | valid JSON; no navigation edit required |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** `apps/docs/platform/overview.mdx`; create
`scripts/satellite-api-ownership-docs.test.js`.

**Read-only evidence:**
`apps/docs/platform/architecture/satellite-apps.mdx`, satellite route trees,
and Plan 131's four corrected application pages.

**Out of scope:** changing any route, proxy, auth behavior, the Forms-owned
architecture page, navigation, or migration artifacts.

## Git workflow

Use `docs/satellite-api-ownership-overview` and commit
`docs(platform): correct satellite API ownership`. Claim/release the commit
window; do not push.

## Steps

1. Add a focused script test that reads only the overview section, proves each
   current stale absolute is present in the red phase, then expects the
   local-product-first/fallback language and link to the satellite guide.
   **Verify:** the focused command fails before the docs edit for the named
   stale claims.
2. Rewrite the section: satellites may own product APIs locally; unmatched or
   explicitly central route families can fall back to live Web; Web remains
   authoritative only where the route family has not hard-cut over. Link the
   focused ownership and TanStack/Rust migration guides.
   **Verify:** focused test passes and stale-phrase search is empty.
3. Run docs JSON, `bun check`, whitespace, and exact-scope status checks.
   Record the focused red/green evidence in the coordination note.

## Test plan

The new test must fail on all four stale absolute forms, pass on the corrected
section, require both ownership-guide links, and stay section-bounded so valid
historical explanations elsewhere are not rejected.

## Done criteria

- [ ] The overview describes local product API ownership plus explicit fallback.
- [ ] It no longer says every satellite is UI-only or all APIs belong to Web.
- [ ] The focused contract test records a red phase and passes after the edit.
- [ ] `bun check`, docs JSON, and `git diff --check` pass.
- [ ] Only the two in-scope deliverables are modified.

## STOP conditions

Stop on exact-path ownership, implementation base not containing Plan 004's
automatic discovery, route evidence contradicting the documented model, need
to edit the Forms-owned guide or root manifest, or any gate failing twice.
