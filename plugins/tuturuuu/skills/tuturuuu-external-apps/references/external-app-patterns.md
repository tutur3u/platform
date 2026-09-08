# External App Integration Patterns

Use this reference when an app outside `apps/web` needs Tuturuuu identity,
workspace access, external-project content, Drive storage, or publishing.

## Auth And Session Shape

External apps should use a server-owned exchange route:

1. Browser receives a short Tuturuuu cross-app token from the centralized login
   or handoff flow.
2. External app server posts to `/api/v1/auth/app-token/exchange` with
   `appId`, `appSecret`, `workspaceId`, `requestedScopes`, and `token`.
3. Platform validates the cross-app token, app secret, linked workspace,
   membership, and external-project permissions.
4. External app stores the returned access token, refresh token, workspace ID,
   user ID, and expiries in an encrypted `HttpOnly` cookie.
5. Browser uses the external app's own API routes; those routes attach the
   current Tuturuuu bearer server-side.

Refresh should be a first-class route in the external app. The browser may call
it before expiry, and all admin fetch helpers should retry a `401` once after a
refresh attempt. Refresh requests still include the server-only `appSecret` and
the linked `workspaceId`, and Platform should re-run permission checks before
issuing the next access token.

Refresh tokens should use a dedicated refresh-only scope, such as
`app-token:refresh`. They must not be accepted by external-project API routes as
normal `external-projects:*`, `external-projects:manage`,
`external-projects:publish`, or `external-projects:read` bearer tokens.

## Pending Workspace Invitations

The app-token exchange can return `PENDING_WORKSPACE_INVITE` with a safe
invitation summary and a single-use `invitationActionToken`. This is an
actionable auth state, not a generic forbidden error.

The external app should:

1. Validate that the invitation workspace matches its configured workspace.
2. Store the action token server-side in a short-lived encrypted `HttpOnly`
   cookie together with a generated CSRF token and expiry.
3. Return only the invitation summary, expiry, and CSRF token to the browser.
4. Present clear Accept and Decline actions inside the external app.
5. Post the server-held token, decision, app credentials, requested scopes, and
   workspace ID to `/api/v1/auth/app-token/invitation-decision`.
6. On acceptance, validate the returned session and rotate it into the normal
   admin-session cookie. On decline, clear pending state and return to a useful
   signed-out screen.

Never expose `invitationActionToken` or the app secret to the browser. Apply
same-origin validation and timing-safe CSRF comparison to the decision route.
Clear terminal expired, already-used, missing, accepted, and declined states;
keep a still-valid pending cookie only for retryable upstream failures.

## Environment Contract

Prefer app-specific names and keep them server-only unless a value is safe for
the browser:

- `TUTURUUU_API_BASE_URL`: Platform API base, ending in `/api/v1`.
- `TUTURUUU_<APP>_WORKSPACE_ID`: linked external-project workspace.
- `<APP>_APP_ID`: registered external app ID, often the app slug.
- `<APP>_APP_SECRET`: server-only app secret used for exchange and refresh.
- `<APP>_SESSION_SECRET`: server-only cookie encryption secret.

Only expose browser env vars for app URLs, public workspace hints, or feature
flags that contain no secrets.

## Server API Boundaries

External app API routes should be narrow proxies or mutations:

- `GET /api/admin/session`: returns safe session state, never tokens.
- `POST /api/auth/verify-app-token`: exchanges the handoff token and sets the
  encrypted cookie.
- `POST /api/auth/pending-invitation`: accepts or declines the linked-workspace
  invitation and either creates the normal app session or clears pending state.
- `POST /api/auth/session/refresh`: refreshes from the encrypted cookie and
  rotates the cookie.
- `GET` / mutation routes under `/api/admin/members`: proxy external-app-aware
  member, pending-invitation, and role operations for the linked workspace.
- `GET /api/admin/storage`: lists linked external-project storage or returns a
  signed read URL for one file.
- `POST /api/admin/<resource>/upload-url`: returns signed upload metadata only.
- resource create/update routes accept structured fields plus uploaded asset
  metadata; reject raw `File` fields and direct multipart media bytes.

Use explicit `cache: "no-store"` for admin session, auth, and storage calls.
Use public delivery caching only in public content readers that can tolerate
stale data.

## Workspace Access Management

Authenticated external-app admin surfaces should expose workspace access in
place when the app registration grants the required scopes:

- list current members and pending invitations
- invite people and revoke outstanding invitations
- update permitted member roles and remove access with explicit confirmation
- prevent the current operator from accidentally removing their own access
- show loading, empty, success, and actionable error states without exposing
  internal route names or raw platform payloads

Request the narrow `workspace:members:read` / `workspace:members:write` and
`workspace:roles:read` / `workspace:roles:write` scopes needed by the UI. Route
browser calls through the external app's server and the external-app-aware
Tuturuuu endpoints. Pin every operation to the configured workspace; ignore or
reject browser-provided workspace IDs.

## Direct Upload Save Sequence

Do not proxy file bytes through Next.js or app server routes.

The browser flow should be:

1. Validate form fields locally.
2. Request a signed upload URL using only metadata: filename, content type,
   file size, resource slug, and intended storage folder.
3. Upload the file directly to the signed URL with `XMLHttpRequest` or another
   API that exposes byte progress.
4. Save the app resource through the external app API with fields plus uploaded
   metadata: storage path, filename, content type, byte size, and derived
   duration or dimensions.
5. Refresh the admin list only after the final metadata save succeeds.

If direct upload succeeds but metadata save fails, show the uploaded storage
path in the admin error panel so an operator can retry or remove the object.
Never show the signed URL.

## External-Project Mutations

Model data should follow Tuturuuu external-project primitives:

- collections define resource groups such as `voice-reels`, `blog-posts`, or
  landing-page sections
- entries carry title, slug, status, summary, subtitle, profile data, and
  metadata
- blocks carry structured body content such as markdown or rich sections
- assets carry file references, storage paths, source URLs, asset type,
  metadata, alt text, and sort order

Create or update entries with the delivery-facing `status` in the entry payload.
Only call publish/unpublish endpoints when the public delivery implementation
uses publish-event snapshots. If public delivery reads current entries/assets,
an extra publish endpoint can become a redundant failure point.

When updating an uploaded file, prefer replacing or upserting the asset record
from the new storage path and metadata. When removing a file, delete or detach
the asset record and keep linked entries consistent.

## Storage Browsing

Drive storage management is a baseline admin capability when the app requests
`workspace:drive:read` or `workspace:drive:write`. Use the linked workspace's
external-app-aware storage routes. The external app should provide folder and
file browsing, signed previews/downloads, direct uploads, rename/move, and
confirmed delete where granted; all privileged operations stay server-side.

Pin storage roots and every requested path to the configured workspace. Reject
absolute paths, traversal, cross-workspace identifiers, unsupported file types,
and oversized uploads before requesting signed metadata. Never proxy file bytes
through the app server or expose signed URLs beyond the operation that needs
them.

Common admin failure handling:

- If a storage/list/open request returns `401`, refresh the admin session once
  and retry the original request.
- Show `Unauthorized` only after refresh fails.
- For rename/delete operations, return how many asset links were detached or
  updated so the admin can understand linked-resource effects.

## Delivery And Fallback

Public pages should read the Platform delivery payload for the linked
external-project workspace and normalize it into app-owned content models. Keep
static fallback content in the external app for local development, missing
workspace configuration, partially configured workspaces, and transient Platform
failures.

Delivery readers should ignore unrelated collections and tolerate missing
optional blocks/assets. Do not expose CMS/internal vocabulary in public UI or in
simple branded admin surfaces.

## Progress And Diagnostics

Admin save progress should show exact steps and percentages. Useful steps:

- `validate`
- `prepare-upload`
- `upload-audio` or another resource-specific upload step
- `save-entry`
- `save-asset`
- `save-notes` or body/content step
- `publish` or `save-visibility`
- `refresh`

Sanitized debug details may include failing step, status code, downstream error
message, endpoint path, method, storage path, and safe response body. Redact
signed URLs, bearer tokens, app secrets, refresh tokens, cookies, session
payloads, API keys, signatures, and provider credentials by key and by value
pattern.

## Test Checklist

Add focused tests for:

- pending invitation exchange stores the action token only in an encrypted,
  short-lived `HttpOnly` cookie and returns a safe summary
- invitation accept creates a validated app session; decline and terminal
  failures clear pending state; retryable upstream failures remain actionable
- invitation decisions enforce same-origin and CSRF checks
- member and role routes require the matching scopes, pin the configured
  workspace, and prevent accidental self-removal
- Drive list, preview, upload, move/rename, and delete routes reject traversal
  and cross-workspace input and keep signed URLs and file bytes server-bounded
- direct file uploads rejected by metadata save routes
- signed upload URL route validates type, size, slug/path, method, headers, and
  returned storage path
- app-token exchange returns access and refresh tokens with correct scopes
- refresh requests reauthorize workspace access and do not call cross-app token
  validation
- expired external app sessions refresh and validate a new bearer before
  returning admin data
- admin fetch helpers retry once after `401`
- mutation logic uses uploaded storage-path metadata instead of `File`
- publishing behavior matches the public delivery source of truth
- downstream error helpers preserve status, step, message, and sanitized details
