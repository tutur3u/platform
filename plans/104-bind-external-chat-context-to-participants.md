# Plan 104: Bind External Chat Context to Conversation Participants

> **Executor instructions:** Require the canonical conversation-access decision
> before reading any external visitor profile or activity. Preserve the current
> response shape, masking, app-session audiences, and no-store behavior.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/external-context' apps/web/src/lib/chat/private-rpc.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on external-context authorization, chat RPC, or migration-artifact drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** security
- **Depends on:** G22 route-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route requires `view_chat` for the workspace but never proves that the
caller can access the selected conversation. Its admin queries disclose an
external visitor's name, email, phone, masked network hint, and visited routes,
so a workspace viewer who learns another conversation UUID can cross the
conversation-participant privacy boundary.

## Current state

- `external-context/route.ts:13-24` resolves only workspace `view_chat` and then
  creates a service-role client.
- `external-context/route.ts:26-70` queries the caller-selected conversation's
  external thread, conversation timestamps, and up to 100 observations without
  a participant check.
- `external-context/route.ts:92-115` serializes visitor email, phone, display
  name, masked network data, and route history.
- `private.chat_get_conversation` in
  `20260530051003_fix_chat_conversation_send.sql:93-143` already requires
  `view_chat`, validates workspace addressability, and calls
  `private.chat_actor_can_access_conversation`; it returns null for an absent
  conversation and raises `42501` for a nonparticipant.
- Message/item routes use `callPrivateChatRpc('chat_get_conversation', ...)`;
  `messages/[messageId]/route.test.ts` is the nearest RPC-mocking exemplar.
- The exact first-class Web route is tracked as `legacy-next` in
  `route-overrides.json`; no Rust handler owns it.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Remain blocked
while `20260707-141449-codex-g22-time-roles-templates.md` owns the generated
route override and manifest. The Zalo handoff owns adjacent shared Chat UI, but
this plan must not edit that UI.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route test | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/external-context/route.test.ts'` | participant and denial matrix passes |
| Wrapper check | `bun web:api-routes:check` | exit 0 |
| Refresh manifest | `bun migration:tanstack:manifest` | exact route remains tracked with refreshed evidence |
| Migration check | `bun migration:tanstack:check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/external-context/route.ts`
- create the colocated `route.test.ts`
- the exact external-context entry in
  `apps/tanstack-web/migration/route-overrides.json`
- regenerated `apps/tanstack-web/migration/route-manifest.json`
- `plans/README.md` only for status

Do not change visitor-context fields, masking, observation limits, shared Chat
UI, database functions, app-session audiences, or Rust routing.

## Git workflow

Use branch `fix/chat-external-context-access` in an isolated worktree and run
`bun setup`. Commit `fix(chat): bind visitor context to participants`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the privacy boundary

Create the exact route test and separate session-auth, private-RPC, and admin
table mocks. Cover cookie, Chat app-session, and CMS app-session participants;
anonymous, unrelated-target, nonmember, same-workspace nonparticipant, and
cross-workspace actors; missing conversations; RPC errors; and the existing
thread/observation failures. Assert denied callers perform no external-thread or
observation query.

### Step 2: Authorize the conversation before visitor queries

After `resolveChatRouteContext`, call `private.chat_get_conversation` through
`callPrivateChatRpc` with the normalized workspace, route conversation, and
resolved actor. Return 404 `{ error: 'thread_not_found' }` for null, 403
`{ error: 'conversation_forbidden' }` for the canonical forbidden result, and
503 `{ error: 'context_unavailable' }` for unexpected RPC failure. Only then
create/use the admin table client. Do not duplicate membership logic locally or
return raw RPC messages.

### Step 3: Refresh route migration evidence

Update only the exact override note to state that Next enforces workspace
permission plus conversation participation, regenerate the manifest, and run
both migration checks. Do not mark the route migrated.

### Step 4: Run production gates

Run the focused test, wrapper check, migration checks, Web production build,
`bun check`, and whitespace validation.

## Done criteria

- [ ] Visitor context is queried only after canonical conversation access succeeds.
- [ ] Same-workspace nonparticipants and cross-workspace actors receive no PII or activity data.
- [ ] Cookie, Chat, and CMS participant sessions preserve the response and no-store header.
- [ ] The exact route override/manifest evidence is refreshed without changing ownership status.
- [ ] Focused tests, migration checks, Web build, repository gate, and whitespace pass.

## STOP conditions

Stop until G22 transfers the exact artifacts. After transfer, stop if the
canonical RPC no longer distinguishes missing from forbidden, a legitimate
nonparticipant workflow is documented, a Rust handler appears, or a gate fails
twice.

## Maintenance notes

Workspace permission is not conversation authorization. Any future endpoint
that returns participant, visitor, message, or AI context must reuse the same
conversation-access decision before privileged reads.
