# Plan 131: Correct Satellite API Ownership Documentation After Hard Cutovers

> **Executor instructions:** Make the Calendar, CMS, Finance, and Mind
> application docs describe their current local-versus-forwarded API ownership.
> Derive every claim from the live route trees; do not move routes or change
> production behavior in this documentation plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/docs/platform/applications/calendar.mdx apps/docs/platform/applications/cms.mdx apps/docs/platform/applications/finance.mdx apps/docs/platform/applications/mind.mdx apps/calendar/src/app/api apps/cms/src/app/api apps/finance/src/app/api apps/mind/src/app/api`
> The four app trees are read-only evidence. Stop if another cutover materially
> changes ownership before the documentation edit begins.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `27fd7f13bd3ce01c918367bac7a0568595c3d967`
  on branch `docs/satellite-api-ownership`; route-family evidence, retired-claim
  assertions, docs-reference checks, `bun check`, whitespace, and reviewer
  revision passed
- **Priority:** P2
- **Effort:** M
- **Risk:** LOW
- **Category:** docs
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Four contributor pages still say protected APIs live in Web or that the
satellite keeps only authentication routes. The hard-cutover apps now contain
17 CMS, 50 Calendar, 77 Finance, and 11 Mind local route handlers. Following
the docs sends new work to the wrong host, recreating duplicate handlers and
incorrect app-session/migration assumptions.

## Current state

- CMS docs lines 14-16 and 57-63 say all `/api/*` traffic is forwarded and new
  backend behavior belongs in Web; local CMS admin/commerce/workspace handlers
  contradict this. `next.config.ts` uses fallback rewrites, so local matches win.
- Calendar docs lines 45-58 say protected Calendar APIs remain in Web; local
  v1 event, provider, scheduling, category, and time-tracking handlers exist.
- Finance docs lines 40-56 say only auth/session routes are local and CRUD goes
  to Web; the Finance hard cutover now owns workspace-finance routes locally.
- Mind docs lines 76-94 list protected Mind routes as Web-owned/forwarded even
  though the local app implements its v1 board/graph/search APIs.
- Central exceptions still exist. Do not replace one false absolute with the
  opposite false absolute; enumerate or classify the fallback exceptions.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Read each app's current `next.config.ts`/proxy,
route tree, and relevant completed migration note. Ask source owners for review,
but do not edit their source or coordination notes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route inventory | `find apps/{calendar,cms,finance,mind}/src/app/api -name route.ts -print | sort` | every documented local family has a live handler |
| Stale absolutes | `rg -ni 'all cms .*traffic is forwarded|protected calendar data apis remain|protected finance apis stay centralized|keep only host-local auth/session routes|protected mind data stays behind|mind app forwards .*api/v1' apps/docs/platform/applications/{calendar,cms,finance,mind}.mdx` | no output; all six retired claims are absent |
| Docs references | `python3 -c "import pathlib; files=[pathlib.Path('apps/docs/platform/applications')/f'{n}.mdx' for n in ('calendar','cms','finance','mind')]; assert all(p.is_file() and '## API Ownership' in p.read_text() for p in files)"` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** exactly the four application MDX files and
`plans/README.md` for executor status.

**Out of scope:** app source, route moves, API behavior, migration manifests,
navigation, messages, package manifests, generated docs, and coordination notes.

**Read-only drift evidence:** the four app API trees plus their proxy/Next
configs and completed migration notes.

## Git workflow

Use isolated branch `docs/satellite-api-ownership`, run `bun setup`, and commit
`docs(platform): correct satellite API ownership`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Build the current ownership matrix

For each app, classify local auth/build-info, local product APIs, fallback Web
APIs, and any deliberately central provider/OAuth routes. Record route families,
not a brittle dump of every file. Cross-check the fallback rewrite order so the
matrix explains that local handlers win before fallback forwarding.

**Verify:** route inventory command exits 0 and every route family named in the
draft has at least one exact live file; remove any unsupported claim.

### Step 2: Correct CMS and Finance

Document their hard-cutover local product APIs, central exceptions, app-session
boundary, and typed internal-api expectation. Preserve CMS vocabulary and
Finance attachment/security guidance unrelated to ownership.

**Verify:** stale-absolute command has no CMS/Finance match; exact local admin,
commerce, recurring/invoice/wallet examples resolve in the inventory.

### Step 3: Correct Calendar and Mind

Describe local v1 product ownership and the remaining central OAuth/provider or
AI/attachment exceptions precisely. Preserve existing security requirements;
change their owning host only where the route tree proves it.

**Verify:** stale-absolute command returns no matches across all four files and
the docs-reference command exits 0.

### Step 4: Run repository and whitespace gates

Run `bun check` and `git diff --check`. Confirm `git status --short` contains
only the four MDX files and optional advisor status row.

## Done criteria

- [ ] All four API Ownership sections distinguish local handlers from fallback exceptions.
- [ ] Every named route family is backed by a current route or rewrite.
- [ ] No application or migration artifact changes.
- [ ] `bun check` and whitespace gates pass.

## STOP conditions

Stop if a hard-cutover is being actively reversed, route ownership cannot be
resolved from source/coordination evidence, another owner edits one of the four
MDX files, or a gate fails twice.

## Maintenance notes

Update these ownership sections in the same change as future hard cutovers.
Prefer a route-family matrix over absolute statements such as “all APIs live in
Web,” because fallback rewrites intentionally coexist with local handlers.
