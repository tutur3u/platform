# Plan 045: Bind Meet Poll Mutations to Authorized Actors

> **Executor instructions:** Preserve guest polling, but require a verified,
> plan-bound actor for every admin-client mutation and creator authority for
> plan-level controls.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/apis/src/meet/actions/polls.ts packages/apis/src/meet/actions/timeblocks.ts packages/apis/src/meet/actions/auth.ts packages/ui/src/components/ui/legacy/polls/poll-display.tsx packages/ui/src/components/ui/legacy/polls`
> Stop if the Meet guest credential or plan-ownership contract changed.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `5989eec413b6719d92853c1c50a6d8f89def3d38`
  on branch `fix/meet-poll-actor-authorization`; focused API/UI tests, package
  typechecks, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / Object authorization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Poll actions use an admin client while trusting caller-selected guest identity
and plan identifiers. An unauthenticated caller can replace another guest's
votes or add options, and any authenticated user can mutate another owner's
unconfirmed plan.

## Current state

- `packages/apis/src/meet/actions/polls.ts:131` accepts `userType` and `guestId`
  without verifying a guest credential or matching the poll to `planId`.
- `submitVote` at roughly line 327 deletes and replaces votes for the supplied
  guest identity with the same omissions.
- `createPoll` requires authentication but not plan ownership; `toggleWherePoll`
  checks confirmation state but not creator ownership.
- `packages/apis/src/meet/actions/timeblocks.ts:122` already demonstrates the
  intended guest-credential verification pattern.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
Meet ownership notes. Characterize every exported poll action and its callers
before changing argument shapes; never log guest credentials.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Poll tests | `bun --cwd packages/apis vitest run src/meet/actions/polls.test.ts` | all cases pass |
| Poll UI test | `bun --cwd packages/ui vitest run src/components/ui/legacy/polls/poll-display.test.tsx` | guest credentials are forwarded without regression |
| API typecheck | `bun --filter @tuturuuu/apis type-check` | exit 0 |
| UI typecheck | `bun --filter @tuturuuu/ui type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/apis/src/meet/actions/polls.ts`
- A focused `packages/apis/src/meet/actions/polls.test.ts`
- `packages/ui/src/components/ui/legacy/polls/poll-display.tsx` and a focused
  colocated test covering the changed guest-action arguments
- A small shared Meet authorization helper only if both polls and timeblocks
  can consume it without widening either contract

Do not redesign poll UX, confirmation semantics, or guest registration.

## Git workflow

- Branch: `fix/meet-poll-actor-authorization` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(meet): authorize poll mutations`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Define the actor matrix

Inventory create, option, vote, delete, and toggle actions. Classify each as
creator-only, authenticated participant, or verified guest participant. Bind
all poll lookups to the supplied plan before any write. Trace the sole poll UI
caller and carry `guestUser.password_hash` from the existing time-blocking
context through the action contract; never synthesize authorization from
`guestId`.

### Step 2: Verify guest and creator authority

For guest-capable mutations, require the existing guest credential and verify
it against a guest record belonging to the same plan. Never trust `userType` or
`guestId` alone. For creator-only mutations, prove the authenticated user owns
the plan before constructing an admin write.

### Step 3: Fail closed before mutation

Return the established authorization/not-found contract for actor mismatch,
cross-plan poll IDs, confirmed plans, and invalid credentials. Ensure no delete,
insert, or update query runs on a rejected request.

### Step 4: Add action-level regression coverage

Test impersonated guests, cross-plan poll IDs, non-owner authenticated users,
valid owners, valid platform participants, and valid guests. Assert both the
response and absence/presence of admin mutations. The UI test must prove the
credential on the selected guest user is forwarded to option/vote actions.

## Done criteria

- [ ] Every admin poll mutation is bound to both its plan and verified actor.
- [ ] Creator-only operations reject non-creators.
- [ ] Guest polling still works with a valid plan-bound credential.
- [ ] Focused tests, typecheck, `bun check`, and whitespace pass.

## STOP conditions

Stop if callers do not possess a guest credential, participant roles are not
defined well enough to classify an action, or active ownership overlaps these
files. Resolve the contract instead of inventing a weaker identity signal.

## Maintenance notes

Keep actor resolution centralized and fail closed before using the admin
client. Caller-selected identity fields are selectors, never authorization.
