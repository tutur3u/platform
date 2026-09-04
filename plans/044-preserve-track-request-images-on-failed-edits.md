# Plan 044: Preserve Track Request Images on Failed Edits

> **Executor instructions:** Reorder image cleanup so a failed request edit can
> never leave the database pointing at already-deleted storage objects.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/track/src/app/api/v1/workspaces/'[wsId]'/time-tracking/requests/'[id]'/route.ts apps/track/src/app/api/v1/workspaces/'[wsId]'/time-tracking/requests/'[id]'/route.test.ts apps/track/src/lib`
> Stop on material request-image storage, RPC, or authorization drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `1adc88a20123a603784a6c26a6ca062bd6bce892`
  on branch `fix/track-request-image-edit-order`; eight focused tests, Track
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Bug / Storage consistency / Tests
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The edit route deletes old images before committing the database update. If
the update then fails, the unchanged row still references objects that no
longer exist, permanently breaking request evidence.

## Current state

- `requests/[id]/route.ts:347-379` removes requested paths from the candidate
  list and immediately deletes those objects through the primary/fallback
  storage cleanup helper.
- Lines 384-401 only afterward call
  `private.update_time_tracking_request_content` with the new image list.
- On database error, lines 404 onward clean up newly uploaded paths, but cannot
  restore already-deleted original images.
- There is no colocated route test; use existing Track session route tests for
  module mocking and authorization structure.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; inspect active
Track ownership notes. Read the upload-url and image-urls handlers plus
`validateRequestImagePaths` and `removeRequestImagesWithFallback` before
changing sequencing. Preserve both primary and admin-fallback cleanup behavior.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/route.test.ts'` | all cases pass |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/route.ts`
- Create its colocated `route.test.ts`
- A small request-image helper/test extraction only if needed for deterministic
  cleanup-result handling

Do not change signed-upload issuance, accepted path format, request approval,
comments/activity, storage bucket policy, or response fields.

## Git workflow

- Branch: `fix/track-request-image-edit-order` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(track): preserve images on failed request edits`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Characterize the commit boundary

Add tests with deferred/mocked storage and database calls. Prove the current
failure: old-object deletion occurs before the update, and a rejected update
leaves no restoration path. Cover primary and fallback clients.

### Step 2: Commit the row before deleting old objects

Validate all paths and compute `finalImages`, then perform the database update
first. If it fails, delete only `newImagePaths` and leave all original objects
untouched. After a successful update, delete `removedImages`.

### Step 3: Define post-commit cleanup failure semantics

Because the row no longer references removed images after commit, a storage
deletion failure must not claim that the database edit failed. Preserve the
current committed success response and emit structured error telemetry with
the request id and path count. Do not log object paths or credentials. If a
durable cleanup mechanism is discovered during preflight, STOP and propose that
integration as a separately reviewed scope change rather than improvising it.

## Test plan

- Database failure: old images are never deleted; new uploads are cleaned.
- Database success: old images are deleted only after the update resolves.
- Post-commit cleanup failure: committed response is truthful and observable.
- Fallback cleanup, no removals, additions-only, validation failure, auth, and
  not-found behavior remain covered.

## Done criteria

- [ ] No failed database edit can remove an image still referenced by the row.
- [ ] New uploads are cleaned on failed updates.
- [ ] Removed images are cleaned only after commit, with truthful failure semantics.
- [ ] Focused tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if product policy requires deletion to be atomic with the row update, if
there is no acceptable retry/observability contract for post-commit cleanup,
or another active owner claims this exact request route.

## Maintenance notes

Database references are authoritative. For future edits, never destroy an old
object before the commit that removes its reference.
