# Plan 276: Authorize and Allowlist Workspace Settings Mutations

> **Executor instructions:** Replace the membership-only, unrestricted
> `workspace_settings` POST with a registered-app-session-safe, guest-lead-only
> permission boundary. Preserve the current GET response and the supported
> Contacts caller, but reject time-tracking, break, referral, and server-owned
> fields on this compatibility endpoint.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/settings/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/settings/route.ts' apps/web/src/lib/workspace-route-access.ts 'apps/contacts/src/app/[locale]/[wsId]/users/guest-leads/settings-form.tsx' packages/hooks/src/hooks/use-workspace-time-threshold.ts 'apps/inventory/src/app/api/v1/workspaces/[wsId]/promotions/referral-settings/route.ts' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — obtain G22 route-artifact ownership and
  coordinate the maintained Contacts and Inventory settings callers
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / input integrity / migration parity
- **Depends on:** Plan 234 for any concurrent referral-settings work; G22 route
  artifact transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The live POST proves only workspace membership and then spreads arbitrary JSON
into a service-role `workspace_settings` upsert. Any ordinary member can alter
workspace-wide time-tracking, scheduling, guest-lead, or referral behavior and
can forge `created_at`/`updated_at`. The table's direct RLS already requires
`manage_workspace_settings`, so the privileged HTTP compatibility route is a
weaker bypass of the intended database boundary.

## Current state and exact contract

- `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/settings/route.ts`
  wraps GET and POST in `withSessionAuth`, checks membership only, then POSTs
  `{ ...body, ws_id: wsId }` through `createAdminClient()`.
- Generated types expose caller-overwritable `created_at`, `updated_at`,
  `ws_id`, four referral fields, three break fields, and two threshold fields.
  The existing RLS policy requires `manage_workspace_settings` for direct
  writes, but the admin route bypasses it.
- Supported route inventory shows one maintained POST authority:
  `guest_user_checkup_threshold` is edited by the Contacts guest-lead surface,
  already gated by `create_lead_generations`. Time-tracking thresholds use a
  domain-owned RPC requiring both `manage_workspace_settings` and
  `manage_time_tracking_requests`; no maintained time/break caller writes this
  compatibility POST. Referral settings already have
  the maintained Inventory route
  `/api/v1/workspaces/:wsId/promotions/referral-settings`, with its own strict
  contract and tenant-aware migration semantics.
- Move the substantially reworked handler to the existing first-class wrapper
  destination `apps/web/src/app/api/v1/workspaces/[wsId]/settings/route.ts`.
  Verify the wrapper exports GET/HEAD/POST before replacing it, move the new
  focused test with the implementation, delete the legacy source, add/update
  the source-embedded migration override, regenerate the manifest, and run the
  wrapper guard. Keep the route `legacy-next` and `rust-backend`-targeted; Rust
  currently implements GET only and this plan does not add a Rust mutation.
- Preserve GET's current member-readable response and personal-workspace
  `missed_entry_date_threshold: null` behavior. POST must authenticate with
  `resolveWorkspaceRouteAccess`, which accepts the registered Contacts and
  other satellite app sessions and calls `getPermissions` with the resolved
  actor rather than ambient cookies.
- POST accepts exactly a strict object containing
  `guest_user_checkup_threshold` as an integer `1..100`. Reject malformed JSON,
  arrays, empty objects, unknown keys, every time/break/referral field, `ws_id`,
  and timestamps with the existing `{ error: string }` style and HTTP 400
  before the admin client writes.
- Call `resolveWorkspaceRouteAccess(request, rawWsId)` without a
  `requiredPermissions` array to resolve the cookie or registered app-session
  actor and normalized workspace. Then explicitly require
  `access.permissions.containsPermission('create_lead_generations')`. Do not
  alter or rely on the shared helper's multi-permission semantics. A valid actor
  lacking the capability receives the existing non-disclosing 403 response;
  null/unavailable permission evidence also fails closed before the write.
- Normalize/use only `access.permissions.wsId`; build the upsert explicitly as
  `{ ws_id: access.permissions.wsId, guest_user_checkup_threshold }`. Preserve
  the current successful row response and sanitized 500 database-failure
  envelope.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root, Web, Contacts, and backend AGENTS. Obtain G22's
route-overrides/manifest transfer and confirm Plan 234 is not concurrently
editing the referral-settings contract. Do not edit database migrations or
generated types.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "/api/v1/workspaces/.*/settings" apps packages --glob '*.ts' --glob '*.tsx'` | every root-settings GET/POST caller is classified; no referral writer depends on this POST |
| Focused route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/settings/route.test.ts'` | cookie and Contacts app-session auth, guest-lead permission, strict body, success, and database failure pass |
| Route ownership | `bun web:api-routes:check && bun migration:tanstack:manifest` | legacy wrapper is not recreated and the manifest records the first-class source with unchanged ownership |
| Type checks | `bun run --cwd apps/web type-check && bun run --cwd apps/contacts type-check` | both callers and the first-class route compile |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/contacts build` | both production builds exit 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the root workspace-settings GET/POST implementation and a new
focused route test; first-class route move; the exact TanStack override and
generated manifest entry; strict guest-threshold schema and permission tests;
preserving registered satellite app-session authentication.

**Out of scope:** changing GET visibility/projection, the maintained Inventory
referral-settings route, referral-link migration, workspace-config routes,
the maintained time-tracking threshold RPC, break-setting writers, database
RLS/schema/types, UI redesign, Rust GET behavior, adding Rust POST, or production
cutover.

## Steps

1. Inventory every root-settings caller and characterize GET plus POST response
   envelopes. STOP if a supported writer sends referral/server-owned fields or
   any time/break field; move that caller to its domain-owned boundary in a
   separately reviewed plan rather than broadening this POST.
2. Add the focused test at the first-class destination. Cover malformed,
   non-object, empty, unknown, server-owned, time/break, and referral bodies;
   cookie and Contacts app-session actors; missing/present
   `create_lead_generations`; normalized workspace ID; success; and admin query
   failure. Assert every denial precedes admin-client creation or mutation.
3. Replace the generated wrapper with the moved implementation/test and delete
   the legacy source. Preserve GET/HEAD/POST exports exactly and use
   `resolveWorkspaceRouteAccess(request, rawWsId)` for actor/context only, then
   explicitly check `create_lead_generations`; do not change the shared helper.
4. Parse the closed guest-threshold object and explicitly construct the upsert.
   Never spread caller input into the admin write. Preserve GET and the current
   success/database-failure response contracts.
5. Add/update the first-class-source override without marking any method
   migrated, regenerate the manifest, run the Web wrapper guard, then run the
   focused, typecheck, build, repository, whitespace, and scope gates.

## Done criteria

- [ ] Membership alone cannot change any `workspace_settings` field through
      the privileged POST.
- [ ] The guest-lead threshold requires `create_lead_generations` and works for
      cookie plus registered Contacts app-session actors.
- [ ] Time/break, server-owned, and referral fields never reach the admin
      upsert; their domain-owned writers remain the only supported authorities.
- [ ] GET and current success/error bodies remain compatible; unsupported
      settings fields are deterministic 400 responses.
- [ ] The route is first-class, legacy wrapper regeneration is clean, migration
      tracking remains `legacy-next`, and focused/typecheck/build/repository
      gates pass without database/type drift.

## STOP conditions

Stop on missing G22 transfer, active exact-path ownership, an unclassified
supported writer, evidence that the stated permissions differ from maintained
UI authorization, a need to change GET or database semantics, a need to port
POST to Rust, unexpected manifest method drift, or any mandatory gate failing
twice.

## Maintenance notes

Shared physical tables do not justify shared mutation authority. New settings
must use a narrow domain-owned route/schema, and service-role handlers must
construct writes from parsed fields rather than generated table insert shapes.
