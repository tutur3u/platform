# Plan 090: Gate Nova Challenge and Problem Catalogs by Eligibility

> **Executor instructions:** Separate participant-safe catalog reads from
> manager reads. Never expose problem content merely because a caller has a
> Nova session.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/nova/src/app/api/v1/challenges apps/nova/src/app/api/v1/problems apps/nova/src/lib/challenge-management-auth.ts 'apps/nova/src/app/[locale]/(dashboard)/challenges'`
> Stop on Nova visibility, challenge-management, or problem-response drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `ce6a148ac8f8bf10d1ecabca093e65de8d7d9cbd`
  on branch `fix/nova-catalog-eligibility`; 23 focused tests, Nova typecheck and
  production build, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Any authenticated Nova actor can currently enumerate private challenges and
retrieve full problem statements, including material for disabled,
pre-preview, password-protected, or whitelist-only competitions. The participant
page already applies stricter eligibility rules, but the admin-backed APIs do
not.

## Current state

- `apps/nova/src/app/api/v1/challenges/route.ts:9-42` authenticates only a Nova
  actor and selects every private challenge.
- `apps/nova/src/app/api/v1/problems/route.ts:8-59` returns complete problem rows
  globally or for a caller-selected challenge.
- `apps/nova/src/app/api/v1/problems/[problemId]/route.ts:15-47` returns a
  private problem by UUID without resolving challenge eligibility.
- `apps/nova/src/app/[locale]/(dashboard)/challenges/page.tsx:163-175` already
  defines participant visibility using enabled, whitelist, and preview rules.
- `confirmDialog.tsx:230-233` downloads full problems only to determine whether
  a challenge has any; that preflight needs only availability/count.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; read
`apps/nova/AGENTS.md` if present. No current note owns these paths, but recheck
before editing. Preserve global and assigned challenge-manager workflows.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/nova vitest run src/app/api/v1/challenges/route.test.ts src/app/api/v1/problems/route.test.ts 'src/app/api/v1/problems/[problemId]/route.test.ts'` | participant/manager matrix passes |
| UI preflight | `bun --cwd apps/nova vitest run 'src/app/[locale]/(dashboard)/challenges/confirmDialog.test.tsx'` | count-only preflight passes |
| Nova typecheck | `bun run --cwd apps/nova type-check` | exit 0 |
| Nova build | `bun run --cwd apps/nova build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the three Nova challenge/problem GET handlers and focused tests
- one server-only challenge visibility/admission helper under `apps/nova/src/lib/`
- `confirmDialog.tsx` and a focused test for the minimal availability request
- `plans/README.md` only for status

Do not change challenge mutation permissions, session admission, submissions,
grading, passwords, or response contracts used exclusively by authorized
managers.

## Git workflow

Use branch `fix/nova-catalog-eligibility` in an isolated worktree and run
`bun setup`. Commit `fix(nova): gate challenge catalogs by eligibility`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the actor matrix

Add tests for anonymous, ordinary eligible/ineligible participants, whitelisted
and non-whitelisted actors, before/after preview time, assigned managers, and
global managers. Freeze the exact participant-safe challenge projection and
prove password verifier fields never leave the server.

### Step 2: Centralize challenge visibility

Create an injectable server helper that resolves one of: global manager,
assigned manager, eligible participant, or denied. Participant eligibility must
require enabled state, whitelist membership when configured, and preview time.
Only global managers may list the complete management catalog. Assigned-only
managers may list/read only challenges for which
`canManageNovaChallenge(user, challengeId)` succeeds, and only problems under
those challenges; add an assigned-manager cross-challenge denial test.

### Step 3: Split problem content from availability

Require manager access or an eligible active participant session before
returning complete problem content. Replace the confirmation dialog's full-row
fetch with a bounded count/boolean contract. Collection requests without a
challenge must be manager-only.

### Step 4: Verify all surfaces

Run the focused routes/UI tests, typecheck, production build, repository gate,
and whitespace check.

## Done criteria

- [ ] Ineligible participants cannot enumerate restricted challenges or problem content.
- [ ] Managers retain the management catalog they are authorized to use.
- [ ] Participant challenge responses expose only the documented safe fields.
- [ ] Problem availability no longer downloads full problem rows.
- [ ] Focused tests, Nova typecheck/build, `bun check`, and whitespace pass.

## STOP conditions

Stop if manager and participant callers cannot be distinguished server-side,
the page visibility rules disagree with product policy, an active owner claims
the paths, or any required gate fails twice.

## Maintenance notes

Catalog visibility and session admission are different boundaries. Keep
transactional attempt/password admission in Plan 091.
