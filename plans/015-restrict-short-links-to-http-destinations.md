# Plan 015: Restrict Short Links to HTTP and HTTPS Destinations

> **Executor instructions:** Use the existing shared HTTP URL validator at
> every write and redirect boundary. Fail closed for legacy records; do not
> silently rewrite non-web schemes into apparently valid destinations.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/utils/src/format.ts apps/web/src/legacy-api-routes/v1/link-shortener/shorten apps/shortener/src/lib/utils.ts apps/shortener/src/app/'[slug]' apps/shortener/src/app/api/verify apps/tanstack-web/migration`
> Stop if destination creation or resolution moved or gained another writer.

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Shortener
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The short-link creator accepts any URL scheme supported by the generic URL
parser. Both public resolution paths then expose that stored value to browser
navigation. A branded Tuturuuu link can therefore launch arbitrary non-web
protocol handlers. Creation validation is necessary for new data, while
resolution validation is the required defense for existing or externally
written rows.

## Current state

`apps/web/src/legacy-api-routes/v1/link-shortener/shorten/route.ts:17-26`
uses `z.url()` without a protocol allowlist. `apps/shortener/src/lib/utils.ts:6-12`
likewise treats any successfully parsed URL as valid. The unprotected page calls
`redirect(shortenedLink.link)` at
`apps/shortener/src/app/[slug]/server-page.tsx:82-85`; the password endpoint
returns the stored destination at `apps/shortener/src/app/api/verify/route.ts:57-75`
and the client passes it to `router.push`.

The repo already owns the correct primitive:

```ts
// packages/utils/src/format.ts:75-87
export function isValidHttpUrl(url: string | null | undefined): boolean {
  const parsedUrl = new URL(url.trim());
  return (
    (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
    Boolean(parsedUrl.hostname)
  );
}
```

The live Web route is not Rust-owned. Its migration backlog record is
`api:/api/v1/link-shortener/shorten:...` in
`apps/tanstack-web/migration/route-manifest.json:1687-1691`; changing it requires
refreshing the matching override and generated manifest.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared URL tests | `bun --cwd packages/utils vitest run src/format.test.ts` | exit 0; HTTP(S) accepted and non-web schemes rejected |
| Create route | `bun --cwd apps/web vitest run 'src/legacy-api-routes/v1/link-shortener/shorten/route.test.ts'` | exit 0; unsafe destinations never reach hashing/admin writes |
| Resolution tests | `bun --cwd apps/shortener vitest run src/lib/utils.test.ts 'src/app/[slug]/server-page.test.tsx' src/app/api/verify/route.test.ts` | exit 0; both public paths fail closed |
| Migration tracking | `bun migration:tanstack:manifest` | exit 0; only matching route bookkeeping changes |
| Repository gate | `bun check` | exit 0 |
| Builds | `bun --cwd apps/web run build && bun --cwd apps/shortener run build` | both exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/utils/src/format.ts` only if a parsed-URL return helper is required,
  plus new `packages/utils/src/format.test.ts`; reuse `isValidHttpUrl`
- Web shorten route and new colocated test
- `apps/shortener/src/lib/utils.ts` and new test
- Public server page, password verification route, and new focused tests
- `password-form.tsx` only if response typing must prevent unsafe navigation
- Matching `route-overrides.json` entry and generated route manifest

Out of scope: analytics, password hashing, slug policy, preview fetching,
database cleanup/deletion, DNS, and redirects to custom app protocols.

## Git workflow

- Branch: `fix/shortener-http-destinations` in an isolated worktree.
- Conventional Commit: `fix(shortener): restrict destination protocols`.
- Do not push/open a PR unless instructed. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Characterize one shared URL contract

Ensure `isValidHttpUrl` tests cover normalized HTTP/HTTPS with real hostnames,
mixed-case schemes, whitespace, malformed URLs, relative paths, hostless URLs,
and representative non-web schemes. Do not weaken the function to accept a
scheme merely because the platform `URL` constructor parses it.

**Verify:** shared focused tests exit 0.

### Step 2: Reject unsafe destinations at creation

Refine the Web request schema with `isValidHttpUrl` and a stable validation
message. Trim once after validation and use the same normalized string for
storage and hostname extraction. Validate before password hashing, slug lookup,
admin-client creation, or membership-independent work.

**Verify:** route tests prove HTTP/HTTPS success, non-web/malformed rejection
with 400, and zero bcrypt/admin/database calls on invalid input.

### Step 3: Fail closed at both resolution boundaries

Make Shortener's `isValidUrl` delegate to or be replaced by
`isValidHttpUrl`. Keep the public server page's invalid-link UI and ensure it is
reached before analytics or redirect. In the password verification route,
validate `link.link` before returning it both when no password is configured and
after a successful password check; invalid legacy values return a stable error
and do not record analytics.

**Verify:** server-page and verify-route tests cover valid HTTP/HTTPS, invalid
legacy destination, correct/incorrect password, and assert invalid data never
reaches `redirect`, analytics, or a success payload.

### Step 4: Refresh migration ownership

Add or refresh only the shorten POST backlog entry in
`route-overrides.json`, preserving Next ownership, then regenerate the manifest.
Do not mark Rust parity implemented.

**Verify:** `bun migration:tanstack:manifest` exits 0 and the generated diff is
limited to the shorten route record.

### Step 5: Run complete gates

Run all commands in the table. Both Next builds are mandatory because this plan
changes a Web API handler and Shortener route behavior.

## Done criteria

- [ ] New short links accept only HTTP/HTTPS URLs with a hostname.
- [ ] Both password-free and password-protected resolution reject unsafe legacy
  destinations before analytics or navigation.
- [ ] One shared validator defines the protocol contract.
- [ ] Migration tracking reflects the changed live Next handler.
- [ ] Focused tests, manifest generation, `bun check`, both builds, and
  whitespace pass.

## STOP conditions

Stop if a supported product requirement depends on custom protocols, another
runtime writer can store destinations, or existing non-HTTP rows require an
operator migration. Inventory legacy rows by aggregate protocol counts only;
do not print destination values.

## Maintenance notes

Validation at write time does not replace validation at redirect time. Future
link import/update features must reuse the shared HTTP validator, and reviewers
should reject any direct navigation of an unvalidated stored destination.
