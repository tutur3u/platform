# Plan 026: Bind Rewise AI Work to the Selected Workspace

> **Executor instructions:** Thread the layout-authorized workspace through
> every Rewise chat, summary, creation, and attachment operation, and enforce
> membership again at the shared server routes. Do not trust a client workspace
> id without server authorization.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- 'apps/rewise/src/app/[locale]/(dashboard)/[wsId]' packages/ai/src/chat/google apps/rewise/src/app/api/ai`
> Stop on material Rewise routing, chat-auth, credit-source, or persistence drift.

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** Architecture / Correctness / Tenant isolation
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Rewise authorizes the workspace in its dashboard layout but discards the
normalized id before rendering chat. The client then submits the platform root
workspace for streaming and attachments, while title and summary routes resolve
a different implicit workspace. Billing, memory, and storage can therefore be
attributed to a workspace other than the one visible in the URL.

## Current state

- `apps/rewise/src/app/[locale]/(dashboard)/[wsId]/layout.tsx:32-66` resolves
  the satellite actor, verifies membership through `getWorkspace`, and obtains
  canonical `workspace.id`.
- `chat.tsx:22-31` has no workspace prop; lines 76-91 put
  `ROOT_WORKSPACE_ID` in every stream body, and lines 386-393 give that same id
  to `ChatPanel` for file handling. New-chat and summary bodies omit workspace.
- The new-chat, existing-chat, and imagine pages render `<Chat>` without their
  route `wsId`. Existing-chat reads authorize creator/public visibility but not
  a route workspace.
- `packages/ai/src/chat/google/route.ts:178-230` already normalizes submitted
  workspace identifiers and requires membership before credit and persistence
  work. `new/route.ts` and `summary/route.ts` instead call
  `resolveAiMemoryWorkspaceIdForUser`, so they cannot honor Rewise's selection.
- `ai_chats` currently has no workspace column. Adding one is a separate data
  migration and is not required to make each operation use the selected,
  server-authorized workspace.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$vercel-react-best-practices`, and `$tuturuuu-agent-coordination`. Confirm no
active Rewise or shared-chat owner overlaps the listed paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Rewise tests | `bun --cwd apps/rewise vitest run` | workspace propagation cases pass |
| AI tests | `bun --cwd packages/ai vitest run src/chat/google` | membership and attribution cases pass |
| Typechecks | `bun --cwd apps/rewise run type-check && bun --cwd packages/ai run type-check` | both exit 0 |
| Repository gate | `bun check` | exit 0 |
| Rewise build | `bun --cwd apps/rewise run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Rewise new-chat, existing-chat, and imagine pages under
  `apps/rewise/src/app/[locale]/(dashboard)/[wsId]/`
- `apps/rewise/src/app/[locale]/(dashboard)/[wsId]/chat.tsx` and focused tests
- Rewise local AI wrapper factories only when needed to inject satellite auth
- `packages/ai/src/chat/google/route.ts`, `new/route.ts`, and
  `summary/route.ts`, their auth helper, and focused tests

Do not add `ws_id` to `ai_chats`, change public-chat visibility, expand model
selection, alter credit-source policy, or redesign Rewise knowledge storage.

## Git workflow

- Branch: `fix/rewise-workspace-attribution` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(rewise): bind AI work to selected workspace`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Pass the authorized workspace into Chat

Add required `wsId: string` to `ChatProps`. Include `wsId` in the route params
for all three pages and pass it to `<Chat>`. Because page params can contain a
slug, resolve the same canonical workspace id used by the layout through a
small server helper rather than trusting a raw URL segment. Reuse the existing
satellite actor and membership rules; do not add a client-side lookup.

**Verify:** component/page tests prove each route supplies its canonical
workspace and the `ROOT_WORKSPACE_ID` import disappears from `chat.tsx`.

### Step 2: Propagate it through every operation

Use the required prop in stream transport and `ChatPanel`. Include it in
new-chat and summary request bodies. Audit all fetches/mutations in `chat.tsx`
and its directly rendered file workflow; no AI, summary, persistence, or
attachment operation may retain an implicit/root workspace.

**Verify:** one test renders workspace A then B and asserts every recorded
request/body/storage prop uses only the corresponding id.

### Step 3: Enforce selected-workspace membership server-side

Extend new-chat and summary schemas to accept `wsId`, normalize it using the
authenticated request client, and verify `MEMBER` access before model, message,
or update work. Use the normalized id for `withAiMemory` and any billing/credit
context. Keep the streaming route's existing membership guard and add tests
that make its contract explicit. Denied requests must not query chat messages,
call a model, mutate a chat, or address storage.

**Verify:** app-session-only members succeed; anonymous, malformed workspace,
nonmember, and membership-lookup-error cases return the canonical 401/422/403/
500 responses with zero downstream calls.

### Step 4: Protect cross-workspace regression and run gates

Add focused route tests that use two workspace ids and prove each request's
memory, credit, persistence, and attachment context remains isolated. Preserve
creator/public chat-read behavior because chat rows are not workspace-owned.
Run every command in the table, including the Rewise build.

## Done criteria

- [ ] Rewise never imports or submits `ROOT_WORKSPACE_ID` from chat UI.
- [ ] Stream, new, summary, memory, billing, persistence, and attachments use
      the selected canonical workspace.
- [ ] Shared routes independently reject a selected workspace the actor cannot
      access before provider or privileged operations.
- [ ] Existing chat visibility and response shapes remain unchanged.
- [ ] Focused tests, package tests/typechecks, `bun check`, build, and
      whitespace pass.

## STOP conditions

Stop if a selected workspace cannot be resolved without duplicating the layout
lookup, if a shared route has consumers that cannot supply a workspace, if
credit policy intentionally bills a different workspace, or if correctness
requires adding `ai_chats.ws_id`. The last case needs a separate additive
migration/backfill and explicit product decision.

## Maintenance notes

Reviewer focus is the server boundary: prop threading alone is insufficient.
Workspace ownership of saved chat rows remains deliberately deferred.
