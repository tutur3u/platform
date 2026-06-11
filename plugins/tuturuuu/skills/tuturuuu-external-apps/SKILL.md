---
name: tuturuuu-external-apps
description: Tuturuuu external app integration guidance. Use when building branded sibling apps that connect to Tuturuuu through app-token exchange, external-project APIs, signed storage uploads, delivery payloads, refreshable admin sessions, and sanitized operational diagnostics.
---

# Tuturuuu External Apps

## Core Workflow

Use this skill for external or branded apps that connect back to Tuturuuu
instead of living inside `apps/web`, especially sites with their own admin
surface, storage, content delivery, or publishing flow.

Start with `AGENTS.md`, `git status --short`, and active coordination notes.
Then map both sides of the integration:

- the external app's auth/session, admin API routes, storage routes, and public
  content readers
- the Tuturuuu control-plane routes under `apps/web/src/app/api/v1/auth` and
  `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects`
- the external app manifest/schema and any `read*` model normalizers that
  convert entries, blocks, assets, profile data, and metadata into app content

Read `references/external-app-patterns.md` when implementing auth exchange,
direct uploads, storage browsing, publish/delivery behavior, or error reporting.

## Integration Rules

- Keep app secrets server-only. Browsers call the external app's own API routes;
  those routes exchange or refresh Tuturuuu app tokens and attach bearer tokens
  to Tuturuuu API requests.
- Persist admin sessions in encrypted `HttpOnly` cookies with access-token and
  refresh-token expiries. Add proactive refresh and retry-on-401 behavior so
  long-lived admin pages do not fall into stale-token `Unauthorized` states.
- Reauthorize refresh requests against the linked workspace and requested
  external-project scopes. Refresh tokens must not carry normal
  `external-projects:*`, `read`, `manage`, or `publish` bearer scopes.
- Keep file bytes out of app API routes. Request signed upload metadata through
  the app API, upload directly from the browser to the signed URL, then save only
  the returned storage path and file metadata with the entry or asset mutation.
- Reject accidental `File`/`audioFile`/raw multipart uploads in metadata save
  routes with a clear `400`.
- Save delivery-facing status and metadata through the entry or asset payload.
  Do not call extra publish endpoints unless the public delivery path truly
  consumes publish-event snapshots rather than current entry state.
- Show admin progress by explicit step and percentage. Report sanitized status,
  step, short message, uploaded storage path when useful, and downstream details
  without signed URLs, bearer tokens, cookies, session values, app secrets, or
  refresh tokens.
- Keep public content readers resilient: use current delivery payloads when
  available and app-local static fallback content when the Tuturuuu workspace is
  not configured or temporarily unavailable.

## Verification

Run focused tests around the integration boundary before broader checks:

```bash
bun test <session-tests> <auth-exchange-tests> <mutation-tests> <upload-url-tests>
python3 plugins/tuturuuu/scripts/validate_plugin.py
```

For `apps/web` TypeScript, JavaScript, docs, or repo-config changes, finish with
`bun check` unless an unrelated pre-existing blocker prevents it.
