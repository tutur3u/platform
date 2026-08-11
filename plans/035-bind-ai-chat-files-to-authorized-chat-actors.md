# Plan 035: Bind AI Chat Files to Authorized Chat Actors

> **Executor instructions:** Treat every AI chat resource path as private
> object-scoped data. A workspace membership check is necessary but never
> sufficient for listing, signing, uploading, or deleting a persisted chat's
> files. Run every gate and update this plan's row in `plans/README.md`.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/legacy-api-routes/ai/chat apps/web/src/app/api/ai/chat apps/web/src/__tests__/api-chat-file-urls-route.test.ts apps/web/src/__tests__/mind-chat-file-app-session-route.test.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on material chat ownership, storage-path, app-session, or migration
> tracking drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Object authorization / Storage
- **Depends on:** G22 route-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while
`tmp/agent-coordination/20260707-141449-codex-g22-time-roles-templates.md`
retains coordinator ownership of `route-overrides.json` and
`route-manifest.json`, both required by this route extraction. Do not edit
through that lane; restore TODO only after explicit transfer or termination.

## Why this matters

Four admin-backed storage handlers authorize only workspace membership even
though the chat restore boundary is creator-scoped. A member who learns another
member's chat or storage identifier can list and read private documents, delete
them, or inject files into that chat's folder.

## Current state

- `legacy-api-routes/ai/chat/file-urls/route.ts:26-104` accepts a caller-selected
  `chatId`, checks membership, then lists and signs its whole folder.
- `signed-read-url/route.ts:25-74` parses only the workspace prefix before
  generating admin-signed URLs for caller-selected paths.
- `delete-file/route.ts:20-67` permits deletion beneath the workspace-wide AI
  prefix without resolving the chat.
- `upload-url/route.ts:47-124` permits a caller-selected `chatId`; only the
  temporary path includes `user.id`.
- `restore/route.ts:10-45` establishes the existing private-chat rule by
  requiring `ai_chats.creator_id = user.id` for both chat and message reads.
- The four implementations remain in the draining legacy tree behind generated
  first-class wrappers. Root policy requires substantially reworked routes to
  move into `apps/web/src/app/api/**` and remain visible in TanStack migration
  tracking.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Inspect all chat creation/share/public flows
before defining the authorization matrix. Do not infer that `is_public` grants
write or delete access.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/web vitest run 'src/app/api/ai/chat/file-access.test.ts' 'src/__tests__/api-chat-file-urls-route.test.ts' 'src/__tests__/mind-chat-file-app-session-route.test.ts'` | ownership and existing app-session contracts pass |
| API migration gate | `bun web:api-routes:check` | exit 0; no regenerated legacy wrappers for moved routes |
| TanStack manifest | `bun migration:tanstack:manifest && bun migration:tanstack:check` | exit 0; routes remain tracked |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- The four AI chat file handlers named above and a shared authorization/path
  helper plus focused tests
- Existing `apps/web/src/__tests__/api-chat-file-urls-route.test.ts` and
  `mind-chat-file-app-session-route.test.ts`
- Their first-class `apps/web/src/app/api/ai/chat/*` locations; delete the
  replaced legacy implementations
- Matching TanStack migration override/manifest artifacts required by the route
  move

Do not redesign public chat sharing, broaden public access to attachments,
change provider chat generation, or change the storage bucket layout without a
separate migration plan.

## Git workflow

- Branch: `fix/ai-chat-file-authorization` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ai): authorize chat file operations`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize the actor matrix and canonical paths

Create fixtures for owner, another workspace member, nonmember, app-session
caller, temporary upload, persisted private chat, and any genuinely supported
shared/public read. Define one strict parser returning workspace, path kind,
chat id or temp user id, and filename; reject missing/extra segments, traversal,
and mixed-workspace batches.

### Step 2: Centralize object authorization

Add a server-only helper that verifies workspace membership and then resolves
the referenced `ai_chats` row. Require creator ownership for persisted private
chat list/read/upload/delete operations. Bind temp paths to the authenticated
user. If current product code intentionally supports public/shared attachment
reads, express that as a separate read-only branch with tests; never grant
upload or delete from `is_public` alone.

### Step 3: Apply the guard before every admin storage call

Use the helper in list, signed-read, upload-url, and delete-file. Authorize every
path in a batch before signing any of them. Return non-enumerating 404/403
responses consistently and never log raw signed URLs or file contents.

### Step 4: Complete the first-class route move

Move the substantially reworked implementations and tests into
`apps/web/src/app/api/ai/chat/**`, delete the legacy implementations, refresh the
migration metadata, and regenerate the TanStack manifest. The current files in
`app/api` are generated wrappers and there are no matching override entries:
replace the wrappers with first-class handlers, add four `legacy-next` /
`rust-backend` override entries keyed to the new first-class source files, and
verify the generated manifest records those sources and pending Rust ownership.

## Test plan

- Add `apps/web/src/app/api/ai/chat/file-access.test.ts` covering owner success,
  cross-user denial inside one workspace, nonmember denial, temp-user binding,
  malformed paths, mixed batches, absent chats, and read/write distinctions for
  any supported public chat.
- Assert unauthorized cases make no storage admin call.
- Preserve allowed extensions, filename sanitization, rate limits, and signed
  URL expiries.

## Done criteria

- [ ] No persisted chat file operation is authorized by membership alone.
- [ ] Temporary paths are bound to the authenticated actor.
- [ ] All batch paths are authorized before any signed URL is minted.
- [ ] Reworked handlers are first-class routes and migration tracking is green.
- [ ] Existing Web/Mind app-session contract tests are updated and pass.
- [ ] Focused tests, route gates, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if public/shared chats currently promise attachment access but the actor
contract is undocumented, if another app writes a path shape the parser cannot
classify, or if a Rust handler already owns one of these methods. Report the
exact caller/path instead of retaining membership-only access.

## Maintenance notes

Keep path parsing and authorization coupled. Any new AI resource route must use
the same helper before an admin storage operation.
