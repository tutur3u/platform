# Plan 064: Fail Closed When Supermemory Authentication Is Unconfigured

> **Executor instructions:** Make the self-hosted Supermemory service refuse to
> start without a nonblank API key, while keeping only its health endpoint
> unauthenticated and preserving the generated-key deployment path.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/supermemory/src/server.js apps/supermemory/src/server.test.js docker-compose/compose.web.prod.sidecars.yml scripts/check-docker-web.js scripts/check-docker-web.test.js scripts/docker-web.test.js`
> Stop on Supermemory runtime, production Compose, or Docker-validator drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Service authentication
- **Depends on:** native CI/cache Compose ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The memory sidecar currently treats an absent API key as authorization success.
A direct start, wrapper-bypassing Compose invocation, or environment regression
can therefore expose workspace memory search, listing, creation, and forgetting
to every process that can reach the service network. The normal Docker wrapper
already generates a key, so the safe contract is to reject insecure startup.

## Current state

- `apps/supermemory/src/server.js:4-13` trims the API key to `''` and validates
  only the database URL before constructing the Postgres client.
- `server.js:36-48` accepts Bearer or `X-API-Key`, but `assertAuthorized`
  returns true for every request when the configured key is blank.
- `server.js:326-347` leaves `/health` public and applies that fail-open check
  to every memory operation.
- `compose.web.prod.sidecars.yml:140-149` passes `SUPERMEMORY_API_KEY` through
  without Compose's required-value interpolation, unlike the required database
  password on the following line.
- `scripts/docker-web/env.js:1028-1043` and
  `scripts/docker-web.test.js:1816-1853` are the maintained deployment path and
  already generate/persist a 64-hex-character key. Preserve that behavior.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`, and
`$tuturuuu-agent-coordination`. Do not start while
`tmp/agent-coordination/20260710-142120-native-ci-cache-artifacts.md` remains an
active/noncanonical owner of the production sidecar and focused Docker
validators. Obtain an explicit handoff or wait for canonical completion.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Service tests | `bun test apps/supermemory/src/server.test.js` | missing/blank-key and route-auth cases pass |
| Docker validator tests | `node --test --test-name-pattern='supermemory' scripts/check-docker-web.test.js scripts/docker-web.test.js` | focused Supermemory contracts pass |
| Docker source validation | `node scripts/check-docker-web.js` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/supermemory/src/server.js` and new
  `apps/supermemory/src/server.test.js`
- `docker-compose/compose.web.prod.sidecars.yml`
- Supermemory-specific assertions in `scripts/check-docker-web.js`,
  `scripts/check-docker-web.test.js`, and `scripts/docker-web.test.js`

Do not rotate or print any credential, change the database schema, change
memory payload/response contracts, protect `/health`, or redesign the Docker
secret-generation/persistence mechanism.

## Git workflow

- Branch: `fix/supermemory-fail-closed-auth` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(supermemory): require service authentication`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Separate startup validation from serving

Refactor `server.js` just enough to export a pure configuration validator and a
request-handler factory with injected `apiKey` and SQL dependency. Execute
`Bun.serve` only from the module's entrypoint. Configuration must trim both
values and throw a credential-free startup error when either database URL or
API key is blank. Never include the supplied key in an error or log.

### Step 2: Preserve one public health path and protect everything else

Keep `GET /health` unauthenticated. Every other method/path must return 401
unless Bearer or `X-API-Key` exactly matches the validated nonblank key; the
handler must reject before parsing a body or touching SQL. Preserve the current
405, invalid-JSON, and operation response shapes after authorization.

### Step 3: Make the production Compose contract explicit

Change only the Supermemory sidecar entry to required interpolation, using the
same `:?` fail-fast pattern as `SUPERMEMORY_POSTGRES_PASSWORD`. Update the
Docker validator and focused fixtures so a missing/blank key makes Compose
configuration invalid while the generated-key wrapper path remains green.

## Test plan

`server.test.js` imports the testable factory without starting a listener and
covers missing, empty, and whitespace-only configuration; public health;
missing/wrong Bearer and `X-API-Key`; correct credentials; and proof that an
unauthorized request never calls the injected SQL double. Docker tests cover
the required interpolation and the existing generated/persisted key path.

## Done criteria

- [ ] A blank `SUPERMEMORY_API_KEY` cannot start the memory service.
- [ ] Only `GET /health` is public; every memory operation fails closed.
- [ ] No real/live credential is committed, and the configured synthetic test
      key is never echoed in logs, errors, or responses; clearly inert fixture
      strings are allowed only inside the authentication tests.
- [ ] Direct Compose configuration requires the key and wrapper generation remains intact.
- [ ] Focused service/Docker tests, Docker validation, `bun check`, and whitespace pass.

## STOP conditions

Stop if the active native CI/cache owner has not released the Compose/validator
paths, any supported deployment intentionally runs without authentication, the
wrapper cannot supply the same key to both Web and Supermemory, or testing the
handler requires a real database/credential rather than dependency injection.

## Maintenance notes

Any future non-health endpoint inherits the authenticated branch by default.
Reviewers should reject per-route opt-outs or blank-key development bypasses;
local development can use a nonsecret fixture key supplied through environment.
