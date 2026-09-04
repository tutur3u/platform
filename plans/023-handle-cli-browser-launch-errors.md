# Plan 023: Handle Asynchronous CLI Browser Launch Failures

> **Executor instructions:** Make CLI authentication print its manual login URL
> when the platform browser process fails asynchronously. Keep the opener
> shell-free and preserve the current callback flow.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/sdk/src/cli/browser.ts packages/sdk/src/cli/browser.test.ts packages/sdk/src/cli/auth.ts packages/sdk/src/cli/auth.test.ts`
> Stop on browser-launch or interactive-auth drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `863b00e1e3d04955edb2d00b3afadbc5c47a824a`
  on branch `fix/cli-browser-launch-errors`; 12 focused tests, SDK
  typecheck/build, all repository gates, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Correctness / CLI / Tests
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Node's `spawn()` normally reports a missing `open`, `xdg-open`, or `rundll32`
executable through a later `error` event rather than a synchronous throw. The
current helper returns success immediately, so CLI login suppresses the manual
URL and can leave a user waiting at a callback server with no usable browser.

## Current state

- `packages/sdk/src/cli/browser.ts:24-30` catches only synchronous exceptions,
  calls `unref()`, and returns `true` before the child process reports whether
  it started.
- `packages/sdk/src/cli/auth.ts:241-244` prints the manual continuation URL only
  when `openBrowser()` resolves `false`.
- `packages/sdk/src/cli/browser.test.ts` covers platform command selection but
  not child-process lifecycle events.
- `packages/sdk/src/cli/auth.test.ts` already owns the interactive login tests
  and is the appropriate place to prove the fallback remains visible.

## Required skills and preflight

Load `$tuturuuu-cli`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Confirm no active SDK/CLI note owns these files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd packages/sdk vitest run src/cli/browser.test.ts src/cli/auth.test.ts` | command selection, spawn, error, and manual fallback cases pass |
| SDK typecheck | `bun run --cwd packages/sdk type-check` | exit 0 |
| SDK build | `bun run --cwd packages/sdk build` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/sdk/src/cli/browser.ts`
- `packages/sdk/src/cli/browser.test.ts`
- `packages/sdk/src/cli/auth.test.ts` only for the user-visible fallback

Do not change login URLs, callback binding, token exchange, shell behavior, or
the supported platform command matrix.

## Git workflow

- Branch: `fix/cli-browser-launch-errors` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(cli): handle browser launch errors`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Inject the process boundary for deterministic tests

Keep `getOpenBrowserCommand()` pure. Add a narrow internal dependency boundary
for platform lookup and child spawning so tests can supply an EventEmitter-like
child without launching a real browser. Retain `detached: true`, ignored stdio,
argument arrays, and no shell.

**Verify:** existing platform-selection tests remain unchanged and no test
invokes an OS browser command.

### Step 2: Resolve from child lifecycle events exactly once

Have the opener resolve `true` only after the child emits `spawn`, and `false`
when it emits `error` or spawning throws synchronously. Attach listeners before
calling `unref()` and guard settlement so event ordering cannot resolve twice.
Do not wait for process exit: a successfully launched detached browser should
let authentication continue immediately.

**Verify:** focused tests cover successful `spawn`, asynchronous `error`,
synchronous throw, and an `error` after successful settlement without unhandled
events or hanging promises.

### Step 3: Prove the authentication fallback

At the interactive login boundary, simulate an asynchronous opener failure and
assert stdout includes the exact generated login URL and the manual instruction.
Also assert a successful spawn does not print the fallback.

**Verify:** the auth tests leave callback servers and fake child listeners
cleanly closed after both cases.

### Step 4: Run package and repository gates

Run every command in the table. Preserve the public helper surface unless a
test-only injectable wrapper is necessary; do not expose Node child-process
types through the SDK's public API.

## Test plan

Use fake child lifecycle events rather than timers or real executables. The
observable contract is the boolean opener result and whether auth prints a
usable manual URL.

## Done criteria

- [ ] A missing or failed platform opener resolves `false` asynchronously.
- [ ] A successfully spawned detached opener resolves `true` promptly.
- [ ] Interactive auth prints the generated manual URL on failure only.
- [ ] No shell is introduced and URL arguments remain intact.
- [ ] Focused tests, typecheck, build, `bun check`, and whitespace pass.

## STOP conditions

Stop if reliable success requires waiting for browser process exit, the auth
test cannot close its callback server deterministically, or the change would
require a shell command or platform-specific URL escaping regression.

## Maintenance notes

Process creation APIs have both synchronous and evented failure modes. Future
CLI launch helpers should test both and expose a deterministic manual fallback.
