# Plan 133: Enroll Chat and Meet Realtime in Canonical Verification

> **Executor instructions:** Turn both deployed Bun transports into private
> workspaces with deterministic transport tests and root-discovered typechecks.
> Do not require real ports, production credentials, or live provider calls.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/chat-realtime apps/meet-realtime apps/hive-realtime/package.json apps/hive-realtime/tsconfig.json apps/hive-realtime/tests package.json turbo.json bun.lock docker-compose/compose.web.prod.sidecars.yml scripts/check-docker-web.js scripts/check-docker-web.test.js tmp/agent-coordination`
> Hive, root config, Compose, and Docker validators are read-only exemplars
> unless this plan explicitly lists them in Scope. Stop on workspace, Docker,
> ownership, or lockfile drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** tests / DX
- **Depends on:** Mail-owned `bun.lock` transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Chat and Meet realtime are production sidecars with health checks and automatic
restart, but neither directory has a package manifest. Turbo therefore omits
their source from root tests and typechecks, allowing a deployed transport
regression or TypeScript error while `bun check` stays green. Hive realtime
already demonstrates the expected private-workspace contract.

## Current state

- Root `test` and `type-check` are Turbo workspace tasks; directories without
  `package.json` are undiscoverable.
- Compose runs `chat-realtime` on 7817 and `meet-realtime` on 7816; each Docker
  image executes TypeScript directly with Bun.
- Chat has no tests for token audience/scope, publish validation, SSE fanout,
  cancellation, or cleanup. Meet has protocol tests in `packages/realtime`, but
  no tests of its Bun WebSocket transport lifecycle.
- `apps/hive-realtime/package.json` and `tsconfig.json` provide exact script and
  compiler exemplars. Its lifecycle tests inject server/timer seams rather than
  binding a real port.
- Adding workspace manifests changes `bun.lock` and requires both Docker deps
  stages to copy the new manifests so frozen install context remains complete.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Wait for the Mail
handoff to transfer `bun.lock`. The completed Meet Cloudflare note is read-only
design context, not active ownership; do not edit or revive it.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Add dev deps | `cd apps/chat-realtime && bun add --dev '@tuturuuu/typescript-config@workspace:*' 'bun-types@^1.3.14' 'typescript@7.0.2' 'vitest@^4.1.10'` and the same command in `apps/meet-realtime` | manifests and lockfile update through Bun only |
| Add workspace dep | `cd apps/chat-realtime && bun add '@tuturuuu/realtime@workspace:*'` and the same command in `apps/meet-realtime` | runtime dependency recorded in both manifests |
| Focused tests | `bun --cwd apps/chat-realtime vitest run tests/server.test.ts tests/token.test.ts && bun --cwd apps/meet-realtime vitest run tests/server.test.ts tests/token.test.ts` | transport/token suites pass without real ports |
| Typechecks | `bun run --cwd apps/chat-realtime type-check && bun run --cwd apps/meet-realtime type-check` | both exit 0 |
| Discovery | `bun turbo:local run test type-check --filter=@tuturuuu/chat-realtime --filter=@tuturuuu/meet-realtime` | four workspace tasks execute and pass |
| Docker contract | `node --test scripts/check-docker-web.test.js && node scripts/check-docker-web.js` | both new manifests are copied; contract passes |
| Frozen install | `bun install --frozen-lockfile` | exit 0; no lockfile diff afterward |
| Repository | `bun check` | root discovers and passes both workspaces |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** new `package.json`, `tsconfig.json`, Vitest config only if needed,
and `tests/{server,token}.test.ts` in both realtime apps; minimal server/token
seams required for deterministic tests; import migration to
`@tuturuuu/realtime/{chat,meet}`; both Dockerfiles' manifest-copy lines;
`bun.lock`; README status.

**Out of scope:** room eviction/backpressure (Plan 134), protocol semantics,
Durable Object behavior, provider integration checks, ports, Compose, root
scripts, live credentials, deployment, package publication, and unrelated
lockfile churn.

**Read-only drift evidence:** Hive realtime exemplar, root Turbo scripts,
Compose, Docker validator/tests, and completed Meet design note.

## Git workflow

After transfer use `chore/enroll-chat-meet-realtime-tests`, run `bun setup`, and
commit `test(realtime): enroll chat and meet transports`. Claim/release the
commit window; do not push unless instructed.

## Steps

### Step 1: Add private workspace contracts through Bun

Create names `@tuturuuu/chat-realtime` and `@tuturuuu/meet-realtime`, private,
ES module manifests with `test`, `test:watch`, and `type-check` scripts matching
Hive. Add dependencies through the listed Bun commands, not manual manifest
edits. Add compiler configs covering `src/**/*.ts` and `tests/**/*.ts` with Bun
types. Update each Docker deps stage to copy its new manifest; keep runtime
ports and commands unchanged.

**Verify:** frozen install passes; `bun pm ls --all` resolves both workspaces;
Docker contract passes without validator changes.

### Step 2: Add deterministic Chat transport tests

Inject only the `Bun.serve` and timer seams needed to instantiate handlers in
memory. Cover health/not-found, missing/invalid subscription token, publish
scope/audience/workspace mismatch, valid eligible fanout, ineligible audience,
stream cancellation, failed enqueue cleanup, and heartbeat disposal. Do not
bind a port or snapshot any credential value.

**Verify:** Chat focused tests pass and leave no timer/room state across cases.

### Step 3: Add deterministic Meet transport tests

Use an injected serve/timer/SFU boundary. Cover health/not-found/upgrade
failure, invalid token, open/admission messages, malformed messages, SFU
failure classification, multi-socket close semantics, last-socket participant
release, interval ownership, and stop cleanup. Preserve Worker/Durable Object
source untouched.

**Verify:** Meet focused tests pass with no real port/provider/credential.

### Step 4: Prove canonical discovery

Run scoped Turbo tasks, direct suites, Docker contract, frozen install, and
`bun check`. Confirm Turbo logs name both new workspaces and status contains
only scoped manifests/config/tests/seams/Dockerfiles/lockfile.

## Done criteria

- [ ] Both production transports are private Turbo workspaces.
- [ ] Root tests and typechecks execute both workspace tasks.
- [ ] Transport/auth/lifecycle tests bind no real port or provider.
- [ ] Docker frozen-install context includes both manifests.
- [ ] Focused, Docker, frozen-install, repository, and whitespace gates pass.

## STOP conditions

Stop if lock ownership is not transferred, package registration changes Docker
runtime resolution, a test requires a live credential/provider/port, source
behavior must change beyond a test seam, Worker/Durable Object behavior would
change, or a gate fails twice.

## Maintenance notes

Keep these transports enrolled whenever their production Docker entrypoints
change. Plan 134 owns lifecycle policy changes after this characterization
lands.
