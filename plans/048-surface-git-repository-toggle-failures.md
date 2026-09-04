# Plan 048: Surface Git Repository Toggle Failures

> **Executor instructions:** Never report a successful repository toggle unless
> the targeted row was updated; preserve safe redirect-based form handling.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/git/src/app/'[locale]'/-/'[wsId]'/admin-actions.ts apps/git/src/app/'[locale]'/-/'[wsId]'/repositories`
> Stop if the action or page feedback contract changed.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Git production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/fix-git-repository-toggle-feedback`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Correctness / Admin feedback / Tests
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The admin action redirects with `updated=1` even when the database update fails
or no repository row exists. Operators receive false confirmation while no
state changed and no audit event was recorded.

## Current state

- `admin-actions.ts:204-231` checks the update result only to decide whether to
  audit and revalidate, then unconditionally redirects with success.
- The update is not scoped by `wsId`; the action must preserve the existing
  global-admin contract but explicitly decide whether tenant scoping is expected.
- No focused action test covers update failure or a missing row.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect current Git
admin page error rendering and active Git ownership notes. Do not expose raw
database error details in query parameters.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Action tests | `bun --cwd apps/git vitest run 'src/app/[locale]/-/[wsId]/admin-actions.test.ts'` | all cases pass |
| Git typecheck | `bun run --cwd apps/git type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Git build | `bun run --cwd apps/git build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- The Git admin actions module
- A focused colocated action test
- Repository-page feedback copy only if the existing generic error channel
  cannot represent the failure; update both `en.json` and `vi.json` if needed

## Git workflow

- Branch: `fix/git-repository-toggle-feedback` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(git): surface repository toggle failures`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Define success precisely

Treat a database error and a no-row result as failure. Redirect with a stable,
sanitized error signal and do not audit or revalidate. Only redirect with
`updated=1` after a returned repository row.

### Step 2: Preserve side-effect ordering

After a confirmed update, record the audit event and revalidate the exact
repository tag before success. Preserve the current best-effort audit contract:
`recordGitAuditEvent` logs and resolves on insert failure, so a confirmed toggle
still redirects successfully. Mock that resolved failure behavior explicitly;
changing the shared audit helper or its other callers is outside this plan.

### Step 3: Add regression tests

Cover unauthorized admin, successful enable/disable, database error, missing
row, sanitized redirects, audit event type, and cache-tag behavior.

## Done criteria

- [ ] Failed or missing updates never produce the success query flag.
- [ ] Successful updates retain audit and revalidation behavior.
- [ ] Caller-visible errors contain no raw database details.
- [ ] Focused tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if repository toggles are intentionally workspace-scoped but the current
schema cannot prove that relation, or another active owner claims the action.

## Maintenance notes

Redirect-based server actions need explicit success predicates. Test both
resolved database failures and thrown failures.
