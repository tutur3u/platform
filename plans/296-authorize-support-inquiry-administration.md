# Plan 296: Require Root Membership for Support-Inquiry Administration

> **Executor instructions:** Make the API, direct page load, and prepared Rust
> PATCH agree with the settings navigation: global inquiry administration is
> available only to authenticated Tuturuuu root-workspace members.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/inquiries/route.ts' 'apps/web/src/legacy-api-routes/v1/inquiries/[id]/route.ts' 'apps/web/src/app/api/v1/inquiries/route.ts' 'apps/web/src/app/api/v1/inquiries/[id]/route.ts' 'apps/web/src/app/api/v1/inquiries/route.test.ts' 'apps/web/src/app/api/v1/inquiries/[id]/route.test.ts' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/inquiries/page.tsx' apps/backend/src/contact.rs apps/backend/src/tests/g13.rs apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / migration parity
- **Depends on:** backend/G22 route-artifact transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The settings contract exposes inquiries only in the root workspace to a
Tuturuuu member, but the global GET and PATCH APIs require only an account with
a Tuturuuu-domain email. A valid company-domain actor who is not a root member
can call the APIs directly to list inquiry subjects/statuses or alter any
inquiry through a service-role write.

## Current state and exact contract

- `settings/permissions/route.ts:91-95` defines
  `canAccessInquiries = isRootWorkspace && isTuturuuuMember`; lines 101-125
  publish that result in the settings summary and availability map.
- `legacy-api-routes/v1/inquiries/route.ts:46-62` gates GET only with
  `isValidTuturuuuEmail`; `[id]/route.ts:35-53` does the same before an admin
  PATCH. The page at `.../inquiries/page.tsx:48-68` repeats domain-only access.
- Rust `apps/backend/src/contact.rs:806-900` verifies an auth user and domain
  before service-owned PATCH, but not root membership.
- POST inquiry creation remains available to every authenticated actor and must
  not gain the admin gate. The media-URL route remains creator-bound and is
  unchanged.
- Freeze admin responses: unauthenticated -> 401; authenticated non-root member
  (including a valid company-domain account) -> sanitized 403; root member ->
  existing GET/PATCH behavior. Do not reveal whether an inquiry ID exists
  before authorization. Authenticate and verify membership before parsing the
  PATCH body in both TypeScript and Rust, so malformed unauthorized requests
  still receive the frozen 401/403 rather than a validation oracle.
- The page additionally requires the **normalized route workspace ID** to equal
  `ROOT_WORKSPACE_ID`. A root member visiting a non-root workspace URL is
  denied before any inquiry query; membership alone does not make every
  workspace-scoped settings URL an inquiry console.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read `apps/backend/AGENTS.md`. Obtain G22/backend and
route-manifest transfer. Because these Web APIs are being changed, move the
GET/POST collection implementation and PATCH item implementation out of the
legacy tree into first-class `apps/web/src/app/api/**` files, moving/creating
their colocated tests and deleting only the superseded legacy files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web focused | `bun --cwd apps/web vitest run 'src/app/api/v1/inquiries/route.test.ts' 'src/app/api/v1/inquiries/[id]/route.test.ts'` | method-specific root authorization and unchanged POST pass |
| Rust focused | `cargo test --manifest-path apps/backend/Cargo.toml support_inquiry` | Rust PATCH auth and response parity pass |
| Route tracking | `bun web:api-routes:check && bun migration:tanstack:manifest && bun migration:tanstack:check` | legacy wrappers stay absent and the intentionally changed manifest is internally fresh/stable |
| Web gates | `bun run --cwd apps/web type-check && bun run --cwd apps/web build` | Web compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** first-class Web collection/item routes and tests; deletion of the
two superseded legacy implementations; the inquiries page; method-specific
route override/manifest entries; Rust inquiry PATCH authorization and its
focused tests. A small shared Web inquiry-admin helper is allowed.

**Out of scope:** inquiry creation eligibility/payload; media signing; support
table RLS redesign; inquiry fields/filtering/pagination; named admin permission
beyond the established root-membership contract; deployment/cutover.

## Steps

1. Add red Web tests proving GET/PATCH deny unauthenticated, company-domain
   non-root, and ordinary non-root actors before admin reads/writes; root members
   retain success. Include malformed unauthorized/nonmember PATCH bodies and
   prove auth precedes parsing. Prove POST remains authenticated but does not
   require root.
2. Implement one app-session-safe root-membership helper using the resolved
   session user and `ROOT_WORKSPACE_ID`; do not infer membership from email.
   Apply it before GET/PATCH parsing/service-role work. On the page, normalize
   the route `wsId`, require it equals the root ID, then require actor root
   membership before any inquiry query. Add root-member/non-root-route denial.
3. Move the changed handlers/tests to first-class route files, delete the two
   legacy implementations, update actual matching override keys, and regenerate
   the migration manifest. Preserve HEAD/OPTIONS/wrapper behavior if present.
4. Apply the identical membership rule to Rust PATCH using the established
   root-workspace authorization module. Add cookie/bearer root-member and
   non-member cases without expanding `contact.rs` substantially.
5. Run focused, Rust, manifest, Web, repository, whitespace, and scope gates.

## Done criteria

- [ ] Global inquiry GET/PATCH require authenticated root membership; the page also requires the root route workspace.
- [ ] POST creation and creator-bound media behavior are unchanged.
- [ ] Web and prepared Rust PATCH agree on actor outcomes and sanitized envelopes.
- [ ] Changed Web handlers are first-class and migration tracking is stable.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on missing G22/artifact transfer; evidence that a non-root actor is an
approved inquiry administrator; Rust cannot query root membership through the
existing auth adapter; moving the route would change POST/app-session behavior;
`contact.rs` requires a substantial edit without extraction; or a gate fails
twice.

## Maintenance notes

Email domain is identity metadata, not authorization. Keep navigation, direct
page loads, TypeScript APIs, and Rust handlers on one membership contract.
