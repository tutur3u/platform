# Plan 077: Preserve AI Key External-App Binding During Rotation

> **Executor instructions:** Make rotation preserve every policy-bearing field,
> especially `external_app_id`, and characterize the one-time-secret response.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/keys/[keyId]/route.ts' 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/keys/[keyId]/route.test.ts' 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/keys/route.ts' apps/ai/src/lib/public-api.ts apps/ai/src/lib/public-credential.ts`
> Stop on key-policy or rotation-response drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** Correctness / credential policy
- **Depends on:** CS35 gateway machine-credential ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Creation can bind an API key to a registered external app, but rotation omits
that binding. The replacement is silently treated as a normal metered key, so
the same workload changes attribution, registration enforcement, and billing
behavior merely because the operator rotated its secret.

## Current state

- `apps/ai/.../ai/keys/route.ts:151-186` validates and persists
  `external_app_id` at key creation and returns it in the key projection.
- `apps/ai/.../ai/keys/[keyId]/route.ts:64-80` copies rate, model, budget,
  expiry, and environment policy but omits `external_app_id`; its response
  projection omits the field too.
- `apps/ai/src/lib/public-api.ts:70-91` uses the binding to attribute an
  unmetered external-app run.
- `apps/ai/src/lib/public-credential.ts:241-262` uses the binding to revalidate
  current app registration/workspace/scope on every request.
- The existing lifecycle test covers approval denial only and does not inspect
  the replacement insert.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Wait for
`tmp/agent-coordination/20260805-113000-claude-cs35-gateway-machine-credential.md`
to release or explicitly transfer its exact AI key lifecycle/credential paths.
Then run `git status --short` and preserve unrelated AI Studio work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused lifecycle test | `bun run --cwd apps/ai test -- 'src/app/api/v1/workspaces/[wsId]/ai/keys/[keyId]/route.test.ts'` | rotation policy and rollback cases pass |
| AI Studio suite | `bun run --cwd apps/ai test` | all tests pass |
| Typecheck | `bun run --cwd apps/ai type-check` | exit 0 |
| App build | `bun run --cwd apps/ai build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/ai/src/app/api/v1/workspaces/[wsId]/ai/keys/[keyId]/route.ts`
- `apps/ai/src/app/api/v1/workspaces/[wsId]/ai/keys/[keyId]/route.test.ts`
- `plans/README.md` only for status

Do not change key creation approval, secret format, database schema, external
app registration rules, metering policy, or unrelated Studio UI.

## Git workflow

Use branch `fix/ai-key-rotation-binding` in an isolated worktree; run
`bun setup`. Commit `fix(ai): preserve external app key binding on rotation`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the replacement policy

Expand the route mock so rotation returns a complete source key and captures
the insert plus select projection. Define policy-bearing fields as
`allowed_models`, `credit_budget`, `environment`, `expires_at`,
`external_app_id`, and `requests_per_minute`. `created_by`, secret hash/prefix,
name suffix, timestamps, usage, revocation, and rotation links retain their
intentional new-record semantics.

### Step 2: Preserve and return the binding

Add `external_app_id: key.external_app_id` to the replacement insert and include
it in the safe returned key projection, matching creation/list responses. Do
not accept a new caller-selected app ID during rotation. Current request-time
credential validation remains authoritative if an app was disabled after the
original key was issued.

### Step 3: Retain rollback behavior

Prove that a failure to revoke the original deletes the replacement scoped by
replacement ID and workspace, returns 500, and never exposes the generated
secret as success. Preserve approval denial and normal revocation behavior.

## Test plan

- Bound key rotation inserts and returns the identical `external_app_id`.
- Unbound/null keys remain unbound.
- All other policy-bearing fields are copied exactly.
- Caller cannot replace the binding through the rotation body.
- Approval denial generates/inserts nothing.
- Original-revoke failure deletes the replacement and returns no secret.

## Done criteria

- [ ] Rotation cannot change external-app attribution or validation policy.
- [ ] The response exposes the same safe binding metadata as creation/list.
- [ ] Lifecycle tests, full AI suite, typecheck, build, `bun check`, and
  whitespace pass.
- [ ] No schema, secret-format, or unrelated AI file changed.

## STOP conditions

Stop if current ownership is not transferred, the database no longer exposes
`external_app_id`, product policy says rotation should intentionally detach
keys, or a required gate fails twice.

## Maintenance notes

Treat credential rotation as secret replacement, not policy reissuance. New
policy-bearing columns must be added to an explicit rotation-copy contract and
its test.
