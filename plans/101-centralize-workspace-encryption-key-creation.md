# Plan 101: Centralize Race-Safe Workspace Encryption-Key Creation

> **Executor instructions:** Make concurrent first use return the one persisted
> workspace key to every caller. Never encrypt data with a losing generated key
> or expose key material in logs and errors.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/utils/src/encryption packages/utils/package.json bun.lock apps/calendar/src/lib/workspace-encryption.ts apps/tasks/src/lib/workspace-encryption.ts apps/track/src/lib/workspace-encryption.ts apps/inventory/src/lib/workspace-encryption.ts apps/infrastructure/src/lib/workspace-encryption.ts apps/infrastructure/src/lib/inventory/commerce/square/connection-store.ts`
> Stop on encryption-envelope, key persistence, or active integration drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** architecture / correctness
- **Depends on:** Calendar, Tasks, Finance/Inventory, and Mail lockfile ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Five apps carry copies of the workspace-key facade. Their read-then-insert
creation races against the unique workspace constraint; a concurrent loser
returns `null`, causing an otherwise valid credential or encrypted-data write
to fail after another request successfully created the key.

## Current state

- `apps/infrastructure/src/lib/workspace-encryption.ts:48-92` selects, generates,
  and inserts in separate operations and treats every insert error as failure.
- `20251214174704_add_workspace_encryption_keys.sql:5-9` makes `ws_id` unique.
- The same 435-line facade is byte-identical in Infrastructure, Inventory,
  Tasks, and Track; Calendar has a 439-line diagnostic variant.
- `connection-store.ts:208-211` treats a `null` key as a hard credential-write
  failure.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; load
`$tuturuuu-database` only if schema behavior must change. Remain blocked until
all exact app owners transfer the five facades and the Mail lane releases
`bun.lock`. Record hashes before extraction and preserve Calendar-specific
plaintext clamping locally.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Server-only marker | `cd packages/utils && bun add server-only` | owning manifest and lockfile gain the declared runtime marker with no unrelated dependency drift |
| Shared key tests | `bun run --cwd packages/utils test -- src/encryption/workspace-key.test.ts` | concurrent winner/loser and failure cases pass |
| Shared types | `bun run --cwd packages/utils type-check` | exit 0 |
| Consumer tests | `bun run --cwd apps/infrastructure test -- src/lib/inventory/commerce/square/connection-store.test.ts` | credential persistence uses the shared winner |
| App typechecks | `bun run --cwd apps/calendar type-check && bun run --cwd apps/tasks type-check && bun run --cwd apps/track type-check && bun run --cwd apps/inventory type-check && bun run --cwd apps/infrastructure type-check` | all consumers compile |
| App builds | `bun run --cwd apps/calendar build && bun run --cwd apps/tasks build && bun run --cwd apps/track build && bun run --cwd apps/inventory build && bun run --cwd apps/infrastructure build` | every changed app builds |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/utils/src/encryption/workspace-key.ts` and focused test
- one explicit server-only package export and the package-manager-added
  `server-only` dependency in `packages/utils/package.json` plus `bun.lock`
- the five app-local workspace-encryption facades, preserving stable imports
- focused Infrastructure Square connection-store coverage
- `plans/README.md` only for status

Do not change encryption algorithms, master-key format, ciphertext envelopes,
calendar field limits, database schema, or key rotation.

## Git workflow

Use branch `refactor/race-safe-workspace-keys` in an isolated worktree and run
`bun setup`. Commit `refactor(encryption): centralize workspace key creation`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize compatible facades

Freeze enabled/disabled encryption, existing key, missing table, decrypt
failure, first insert, unique-conflict loser, and non-conflict insert error.
Prove no diagnostic contains plaintext, encrypted key, or master-key material.

### Step 2: Extract a server-only persistence boundary

Create an explicit `@tuturuuu/utils/encryption/workspace-key` export whose
module imports `server-only`. Accept injectable client and crypto seams for
tests. Keep event encryption and app-specific clamping in their owning apps.

### Step 3: Resolve the creation race safely

After an insert uniqueness conflict, discard the generated plaintext key. Only
PostgreSQL code `23505` for `workspace_encryption_keys_ws_id_key` is the
expected race; re-read the row by `ws_id`, decrypt the persisted winner, and
return it. Never return the losing key. Fail closed for permissions, transport,
malformed row,
decryption, or non-unique insert errors. Bound the reread attempt; do not loop
indefinitely.

### Step 4: Migrate through stable facades

Replace duplicated get/create/read/delete key logic with thin re-exports or
delegation while preserving each app's current public imports. Verify the
Square hard-failure caller receives a common key under concurrent initialization.

## Done criteria

- [ ] Two concurrent creators both receive the same persisted decrypted key.
- [ ] No caller ever uses the losing generated key.
- [ ] Non-conflict errors still fail closed without secret-bearing logs.
- [ ] The published server-only module declares its marker dependency; manifest and lockfile agree.
- [ ] Five app imports remain stable and duplicated key persistence is removed.
- [ ] Shared tests, consumer coverage, typechecks, builds, and repository gate pass.

## STOP conditions

Stop until every exact owner transfers its facade, if the copies have behavioral
differences beyond documented Calendar clamping, if error codes cannot reliably
distinguish uniqueness conflicts, or if a gate fails twice.

## Maintenance notes

Crypto algorithms may remain shared separately from key persistence. Keep the
server-only boundary narrow so client bundles cannot import administrative key
operations.
