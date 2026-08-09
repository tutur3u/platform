# Plan 018: Correct Learn and Teach Ownership Documentation

> **Executor instructions:** Document the architecture that exists after the
> education satellite hard cutover. Do not move APIs or change runtime code.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/learn/DESIGN.md apps/docs/platform/applications/learn.mdx apps/docs/platform/applications/teach.mdx apps/learn/src/app/api/v1 apps/teach/src/app/api/v1 packages/education-core packages/internal-api/src`
> Re-enumerate route ownership if any runtime path changed.

## Status

- **Execution status:** TODO
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** Documentation / Architecture
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Contributor guidance still describes Learn and Teach as UI-only satellites
whose protected APIs remain in `apps/web`. The completed hard cutover instead
leaves 19 Learn-local and 51 Teach-local v1 route handlers. Following the stale
text can reintroduce migrated APIs into Web, proxy a locally owned route, or
apply the wrong auth and verification model.

## Current state

- `apps/learn/DESIGN.md:47-50` says protected education data and writes stay in
  `apps/web`.
- `apps/docs/platform/applications/learn.mdx:18-20` says Learn-local APIs are
  limited to auth/logout and `/api/v1/*` rewrites to Web.
- `apps/docs/platform/applications/teach.mdx:6-20` repeats the central ownership
  model.
- Learn currently has 19 v1 `route.ts` handlers; Teach has 51.
- `packages/internal-api/src/tulearn.ts` selects Learn for learner endpoints;
  `packages/internal-api/src/education.ts` selects Teach for teacher endpoints.
- `packages/education-core` is shared server-only domain code. Web still owns
  platform login/token issuance and intentionally central AI services.

The text must distinguish runtime ownership, shared domain-code ownership, and
the central platform services that remain on Web.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Read
`tmp/agent-coordination/20260709-075711-claude-education-extraction.md`, but
verify its historical claims against current source.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Learn route inventory | `find apps/learn/src/app/api/v1 -name route.ts -print` | every current handler classified |
| Teach route inventory | `find apps/teach/src/app/api/v1 -name route.ts -print` | every current handler classified |
| Stale claim check | `rg -n -e 'Protected Learn data still belongs' -e 'not a separate backend' -e 'protected API owner' -e 'API routes must stay limited' apps/learn/DESIGN.md apps/docs/platform/applications/{learn,teach}.mdx` | no stale ownership claim |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/learn/DESIGN.md`
- `apps/docs/platform/applications/learn.mdx`
- `apps/docs/platform/applications/teach.mdx`

Do not change APIs, proxies, internal-api clients, package code, authentication,
route manifests, or navigation. Do not add a new docs page.

## Git workflow

- Branch: `docs/education-satellite-ownership` in an isolated worktree.
- Conventional Commit: `docs(education): correct satellite API ownership`.
- Do not push or open a PR unless instructed. Claim the Git commit window before
  staging or committing; never stage coordination notes.

## Steps

### Step 1: Build a current ownership matrix from source

Enumerate Learn and Teach handlers and group them by learner/parent,
teacher/admin, auth handoff, and intentionally central AI/platform services.
Trace representative calls through `packages/internal-api`. Do not put raw route
counts in permanent prose unless an automated invariant protects them.

**Verify:** every ownership statement is backed by a current route, proxy, or
client path.

### Step 2: Rewrite the three stale ownership sections

Make all three documents agree:

- Web owns platform login, cross-app token issuance, and explicitly retained
  central platform/AI services.
- Learn owns learner and parent-facing v1 API contracts.
- Teach owns teacher authoring and administration v1 API contracts.
- `packages/education-core` owns reusable server domain logic, not HTTP traffic.
- `packages/internal-api` selects the owning satellite origin.

Retain accurate auth-cookie, locale, design, CI, and deployment guidance.
Update verification guidance so route changes require focused tests, app
typecheck, `bun check`, and the owning app build.

**Verify:** the stale-claim search prints no matches and the three ownership
sections contain no contradiction.

### Step 3: Run documentation gates

Run `bun check` and `git diff --check`. `git status --short` must list only the
three documents and the executor's permitted plan-index status change.

## Done criteria

- [ ] The three documents describe one current ownership model.
- [ ] Local education APIs are not described as Web rewrites.
- [ ] Retained Web auth/AI responsibilities remain explicit.
- [ ] Runtime, shared-code, and client-routing ownership are distinguished.
- [ ] `bun check` and whitespace pass.

## STOP conditions

Stop if current proxies contradict the route/client matrix, if a new education
migration is active, or if accurate docs require runtime changes. Report the
drift and split runtime work into another plan.

## Maintenance notes

Update these ownership sections whenever an education route moves. Avoid broad
phrases such as “all protected APIs” while central exceptions remain.
