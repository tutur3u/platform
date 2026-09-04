# Plan 020: Enforce the Devbox Container Boundary

> **Executor instructions:** Treat the current host-process runner as a security
> defect. Fail closed unless a runner can prove and use per-lease container
> execution; do not broaden the command denylist as a substitute for isolation.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/sdk/src/cli/devbox-runner.ts packages/sdk/src/cli/devbox-agent-capabilities.ts packages/sdk/src/cli/devbox-doctor.ts packages/sdk/src/cli/devbox.test.ts packages/devbox/src apps/web/src/lib/devboxes apps/web/src/legacy-api-routes/v1/devboxes apps/docs/build/development-tools/remote-devboxes.mdx`
> Stop on runner, lease, authorization, or container-contract drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** Security / Remote execution
- **Depends on:** G22 route-artifact and backend migration ownership transfer
- **Planned at:** commit `68a1457aed`, 2026-08-10

Execution is blocked because the shared Web authorization helper changes the
contract of multiple Devbox routes, including routes already implemented in
Rust (`devbox_cache`, `devboxes_runs`, and `devboxes_run_logs`), while the plan
currently scopes neither Rust parity nor migration metadata. G22 retains the
generated route artifacts and active backend lanes retain those handlers.
Before restoring TODO, refresh this plan with an exact caller-to-Rust-handler
matrix, parity tests, first-class Web route disposition where required, and the
transferred artifact paths. Do not execute the stale Web-only authorization
step.

## Why this matters

The documented contract says every remote command runs inside a per-lease
container with only the workspace and named caches mounted. The runner instead
spawns arbitrary permitted executables directly in its host working directory
and passes host `HOME`, `PATH`, proxy, certificate, and XDG context. A top-level
executable denylist cannot contain interpreters or user-authored programs, so
root-workspace membership currently reaches host-process authority.

## Current state

- `apps/docs/build/development-tools/remote-devboxes.mdx:188-206` promises the
  per-lease Docker/Compose boundary and says host execution is not exposed.
- `packages/sdk/src/cli/devbox-runner.ts:163-214` chooses `process.cwd()` and
  calls `spawn(command[0], command.slice(1), { cwd, env, shell: false })`.
- `packages/devbox/src/command-policy.ts:195-236` blocks a small executable set
  but allows all other generic commands.
- `packages/sdk/src/cli/devbox-doctor.ts:10-100` reports
  `containerized: true` unconditionally; agent capabilities report Docker's
  version but no enforced executor mode.
- `apps/web/src/lib/devboxes/authorization.ts:63-85` accepts every root
  `MEMBER`, without `view_infrastructure` or another operator permission.
- `packages/sdk/src/cli/devbox.test.ts:545-640` proves host-spawn behavior and
  env redaction but has no container-boundary assertion.

## Required skills and preflight

Load `$tuturuuu-devbox-ops` if available, `$tuturuuu-platform`,
`$tuturuuu-development-tooling`, and `$tuturuuu-agent-coordination`. Inspect
runner deployment and cache conventions before selecting image, network, UID,
and volume names. Never place tokens or environment values in tests/docs.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| SDK tests | `bun --cwd packages/sdk vitest run src/cli/devbox.test.ts src/cli/devbox-agent-capabilities.test.ts src/cli/devbox-doctor.test.ts` | exit 0; container and fail-closed cases pass |
| Policy tests | `bun --cwd packages/devbox vitest run src/command-policy.test.ts` | exit 0 |
| Devbox route tests | `bun --cwd apps/web vitest run src/legacy-api-routes/v1/devboxes/agents/routes.test.ts` | exit 0 |
| Typechecks | `bun turbo:local run type-check --filter=tuturuuu --filter=@tuturuuu/devbox --filter=@tuturuuu/web` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/sdk/src/cli/devbox-runner.ts` and focused runner tests
- `packages/sdk/src/cli/devbox-agent-capabilities.ts` and tests
- `packages/sdk/src/cli/devbox-doctor.ts` and tests
- Focused container-command/model helpers under `packages/devbox/src/`
- `apps/web/src/lib/devboxes/authorization.ts` and focused devbox route tests
- Devbox heartbeat capability schema/store only as required to reject unsafe
  runners
- `apps/docs/build/development-tools/remote-devboxes.mdx`
- Focused devbox-ops skill reference if the runtime contract changes

Do not change unrelated Docker deployment, general workspace permissions,
runner tokens, cache eviction, preview URLs, or production credentials.

## Git workflow

- Branch: `fix/devbox-container-boundary` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(devbox): enforce containerized execution`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Add a truthful executor capability and fail closed

Represent executor mode explicitly in agent capabilities, for example
`execution: { mode: 'lease-container', version: 1 }`. Determine it from a real
Docker/container preflight, not a constant. Stop polling/claiming jobs when the
preflight fails, and make doctor report the detected state. The server must not
assign executable jobs to a runner lacking the capability.

**Verify:** tests prove missing Docker, failed preflight, and host-only mode do
not claim or execute a command; no direct host-spawn fallback exists.

### Step 2: Execute every job inside its lease container

Create/reuse a container identity derived from `job.leaseId`. Mount only the
resolved synced workspace plus explicitly named cache volumes. Set container
working directory to the workspace, pass only the existing allowlisted base env
and job env, use a non-root UID where supported, disallow privileged mode and
arbitrary mounts, and preserve exit/signal/timeout/log streaming semantics.
Run the user command as an argv array inside the container; do not concatenate a
shell string unless the submitted command itself explicitly invokes a shell.

**Verify:** injected-spawn tests assert the exact Docker argv and prove the user
command never becomes the host executable. An integration fixture proves a job
can read its workspace but cannot observe a host-only sentinel path.

### Step 3: Bind lifecycle and cleanup to leases

Reuse the same container for runs in one active lease, isolate different lease
IDs, and remove the container on lease release/expiry while preserving named
caches. Make repeated cleanup idempotent and ensure timeout/stop targets the
containerized process rather than an unrelated host process.

**Verify:** lifecycle tests cover reuse, cross-lease separation, release,
timeout, cancellation, crash recovery, and cleanup retry.

### Step 4: Require an operator permission

Change devbox enqueue/read/control authorization from membership type alone to
the existing satellite-aware/root permission model, using
`view_infrastructure` unless product owners require a dedicated permission.
Keep runner-token endpoints on their separate machine-auth boundary.

**Verify:** route tests cover anonymous 401, root member without permission 403,
permitted operator success, and runner-token behavior.

### Step 5: Align docs and run all gates

Document the actual image/config preflight, mounts, cache volumes, network
behavior, UID, cleanup, and STOP behavior. Run every command in the table.

## Test plan

Model HTTP authorization tests on existing devbox agent route tests and process
tests on `packages/sdk/src/cli/devbox.test.ts`. Add negative boundary tests for
host-only files and ambient env; never assert or log real secret values.

## Done criteria

- [ ] No queued user command is spawned directly on the runner host.
- [ ] Unsafe/unavailable container execution fails closed before job claim.
- [ ] Per-lease workspace, cache, environment, lifecycle, and cleanup are tested.
- [ ] Root membership alone cannot operate devboxes.
- [ ] Doctor/capabilities/docs describe measured behavior, not a constant.
- [ ] Focused tests, typechecks, `bun check`, Web build, and whitespace pass.

## STOP conditions

Stop if the deployed agent already runs inside a separately proven per-lease
sandbox, if Docker-in-Docker/network/cache requirements cannot preserve current
workflows, if a new permission enum is required, or if an active owner claims an
in-scope path. Bring back evidence and split rollout rather than weakening the
boundary.

## Maintenance notes

Reviewers should treat any host-spawn fallback as a security regression. Future
runner types must advertise an enforceable isolation contract with a boundary
test, not merely a boolean capability.
