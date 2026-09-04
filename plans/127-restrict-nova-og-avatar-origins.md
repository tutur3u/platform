# Plan 127: Restrict Nova OG Avatar Origins Before Server Rendering

> **Executor instructions:** Treat stored avatar URLs as untrusted at Nova's
> server-side image boundary. Render only explicitly approved public avatar
> storage URLs and use the existing local fallback for every other value.
> Preserve the general profile/avatar contract outside Nova.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/nova/src/app/api/og/[userId]/route.tsx' 'apps/nova/src/app/api/og/[userId]/route.test.tsx' apps/nova/src/lib/og-avatar-url.ts apps/nova/src/lib/og-avatar-url.test.ts packages/utils/src/avatar-url.ts apps/web/src/legacy-api-routes/v1/users/me/profile/route.ts`
> Quote bracketed paths. Stop if the OG renderer, profile write contract, or
> canonical avatar upload path has changed materially.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `eae551967db66e7d8e7af2d23f127a755f549751`
  on branch `fix/nova-og-avatar-origin`; 36 focused tests, full Nova tests,
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / server-side request boundary
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The profile API permits an authenticated user to store any syntactically valid
URL as `avatar_url`. Nova later passes that stored value to `<img src>` inside
`ImageResponse`, whose server renderer resolves remote image assets. A user can
therefore make Nova request an attacker-selected origin whenever the public OG
route is rendered. Nova must constrain the server-side fetch boundary even
though general browser avatar rendering continues to support broader sources.

## Current state

- `apps/web/src/legacy-api-routes/v1/users/me/profile/route.ts:13-17,79-99`
  accepts `z.url()` and persists the selected user's value. This cross-app
  profile behavior is evidence only and remains out of scope.
- `apps/nova/src/app/api/og/[userId]/route.tsx:19-24` loads `avatar_url` through
  an admin client for a caller-selected public profile ID.
- `route.tsx:58-58,241-249` passes that value directly into an image element in
  `ImageResponse`, falling back to Tuturuuu's static logo only when the value is
  nullish.
- `packages/utils/src/avatar-url.ts:41-63` is a browser display normalizer, not
  a server-fetch policy: it intentionally preserves arbitrary HTTP(S), blob,
  data, and relative values. Do not reuse or tighten it globally.
- The maintained upload flow writes public Supabase avatar objects under
  `/storage/v1/object/public/avatars/`; examples and normalization coverage live
  in `packages/utils/src/__tests__/avatar-url.test.ts:36-68,85-95`.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no active
note owns Nova's OG route/helper paths. This is an SSRF-hardening boundary: do
not add a generic remote-fetch proxy, DNS resolver, or redirect-following
allowlist in this plan. Never include real user URLs in fixtures.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| URL policy | `bun --cwd apps/nova vitest run src/lib/og-avatar-url.test.ts` | all approved/rejected URL cases pass |
| OG route | `bun --cwd apps/nova vitest run 'src/app/api/og/[userId]/route.test.tsx'` | stored unapproved URLs use the fallback |
| Nova typecheck | `bun run --cwd apps/nova type-check` | exit 0 |
| Nova suite | `bun run --cwd apps/nova test` | all tests pass |
| Nova build | `bun run --cwd apps/nova build` | exit 0 |
| Workspace gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- `apps/nova/src/app/api/og/[userId]/route.tsx`
- `apps/nova/src/app/api/og/[userId]/route.test.tsx` (create)
- `apps/nova/src/lib/og-avatar-url.ts` (create)
- `apps/nova/src/lib/og-avatar-url.test.ts` (create)
- `plans/README.md` only for the executor's status update

**Out of scope:**

- Web profile routes, avatar upload/storage behavior, or persisted user rows
- the browser-oriented `@tuturuuu/utils/avatar-url` contract
- arbitrary remote-avatar proxying, DNS/network probing, redirects, or image
  transformation services
- Nova scoring/session queries and OG visual design
- dependencies, translations, manifests, and `bun.lock`

**Read-only drift evidence (inspect, do not edit):**

- `packages/utils/src/avatar-url.ts`
- `apps/web/src/legacy-api-routes/v1/users/me/profile/route.ts`

## Git workflow

Use isolated branch `fix/nova-og-avatar-origin`, run `bun setup`, and commit
`fix(nova): restrict server-rendered avatar origins`. Claim and release the
commit window. Do not push unless instructed.

## Steps

### Step 1: Define a narrow server-renderable avatar policy

Create `apps/nova/src/lib/og-avatar-url.ts` with one pure function named
`getNovaOgAvatarUrl` that returns an approved URL or `null`. The exact accepted
contract is:

- absolute `https:` URL only;
- no username/password and no non-default port;
- hostname is a real `*.supabase.co` subdomain (label boundary, not a string
  containment match);
- pathname begins exactly with
  `/storage/v1/object/public/avatars/` and contains a non-empty object path;
- reject protocol-relative, HTTP, data/blob/file, localhost/IP, malformed,
  credential-bearing, alternate-path, and lookalike-host values.

Do not issue a network request while validating. Do not accept a broader origin
because browser components display it safely; this function governs server
egress.

**Verify:** run
`bun -e "const { getNovaOgAvatarUrl } = await import('./apps/nova/src/lib/og-avatar-url.ts'); if (typeof getNovaOgAvatarUrl !== 'function') process.exit(1)"`.
Expected: exit 0; the helper imports without side effects or network access.

### Step 2: Test the URL policy exhaustively

Add table-driven unit tests using inert example Supabase subdomains and object
paths. Include valid nested avatar objects plus every rejection category above,
including hostname suffix confusion and URL-encoded path ambiguity. Assert the
function never throws for arbitrary strings.

**Verify:** run
`bun --cwd apps/nova vitest run src/lib/og-avatar-url.test.ts`.
Expected: every accepted/rejected/encoded/malformed table row passes and the
arbitrary-string case never throws.

### Step 3: Apply the policy at the OG renderer

Resolve `userData.avatar_url` through the new helper before constructing
`ImageResponse`. Use the existing Tuturuuu logo URL when the helper returns
`null`; do not attempt to fetch or probe rejected sources. Keep database and
score/session queries unchanged.

Add a focused route test with mocked admin queries and `next/og`. Capture the
render tree/props passed to `ImageResponse` and prove an approved public avatar
is used while an arbitrary remote/private-style value becomes the fixed
fallback. The test must not make network requests.

**Verify:** run
`bun --cwd apps/nova vitest run 'src/app/api/og/[userId]/route.test.tsx'`.
Expected: approved URLs reach the captured image tree, rejected/null values use
the fixed fallback, and no test network request occurs.

### Step 4: Run all Nova and repository gates

Run both focused suites, full Nova tests/typecheck/build, `bun check`, and
`git diff --check`. Only the four Nova files and advisor status row may differ.

## Test plan

- Pure policy accepts only HTTPS Supabase public avatar-object URLs.
- Scheme, credential, port, host-boundary, IP/local, path, encoding, and
  malformed cases return null without throwing.
- OG route uses approved avatar and deterministic fallback for rejected/null
  values.
- Route test proves no fetch is performed for rejection.
- Nova full suite, typecheck, and production build remain green.

## Done criteria

- [ ] No stored avatar reaches Nova's server image renderer without the narrow
      policy check.
- [ ] Rejected values always use the existing fixed fallback and trigger no
      outbound probe.
- [ ] General profile persistence and browser avatar behavior remain unchanged.
- [ ] Policy and route regression suites cover approved and rejected sources.
- [ ] Focused/full tests, typecheck, build, `bun check`, and whitespace gates
      pass.

## STOP conditions

Stop if `ImageResponse` no longer resolves remote image sources server-side,
Nova must support a documented non-Supabase server-rendered avatar origin,
canonical uploads no longer use the public avatars path, the route cannot be
tested without real network access, a required build hits a repeated
environment-only failure, or any other gate fails twice after one reasonable
correction.

## Maintenance notes

Keep browser display normalization separate from server egress policy. If Nova
later needs provider-hosted avatars, add them only through an explicit reviewed
origin/path contract or a hardened image service with redirect and private-
network protections.
