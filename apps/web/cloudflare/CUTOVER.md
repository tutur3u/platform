# Web issuer cutover for Rex

Status on 4 November 2026: **blocked; do not switch production routing**.
This is the dedicated web issuer lane. Selene must review every PR at its final
head with `security-review-required`. Rex owns deployment; Bea owns credentials.

## Build and verify the candidate

Run on GitHub CI, or the admitted i9 code-only runner with swap below 6 GiB:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run --cwd apps/web test:candidate
bun run --cwd apps/web build:candidate
bun run --cwd apps/web test:candidate:runtime
bun run --cwd apps/web type-check:candidate
```

The `web-start-candidate.yaml` job also resolves the emitted config and runs
`wrangler deploy --dry-run` without credentials. It uploads the sealed Worker,
assets and config as `web-native-<full source SHA>` (`web-native.tar.gz`).
Restore with `wave1-native-archive.py restore apps/web/cloudflare <archive>`,
then `wave1-web-seal.mjs restored <SHA>` to recover the emitted config pointer.
It is validation and artifact preparation, not publish.
The M4 admits only edits, targeted unit tests and Biome. Keep the Next default
build until the issuer works; changing the script alone would strand sign-in.

## Resolve blockers before publication

At source `66903a0ef8`, the route manifest records 844 entries: 12 native Start
entries and 832 Next fallbacks. Native staging returns a static 404 for login
and API routes. This PR additionally ports the deliberately blocked
`/.well-known/*` response in the Worker in separate auth PR #7602; the conservative Start census does not
claim that endpoint is rendered by Start.

Port login, OAuth callback, token exchange/refresh/logout, recovery, MFA, SSO,
CLI auth, app-session issuance, middleware and authenticated workspace APIs.
Preserve current production cookie names, scope, security attributes, chunking
and expiration until Selene accepts equivalent issuer behavior. Move environment
access into request bindings without leaking secret values into client output.
Five Vercel crons and the service worker still have Next ownership; transfer each
explicitly, with rollback that avoids duplicate scheduled writes.

Tonight Rex uses the artifact from web's own workflow. Its build root is
`apps/web/cloudflare`, not the normal app root. No shared publisher change is
needed. Atlas decides auth review timing before Rex switches the issuer route.
Staging and production publication are not enabled by this PR.

## Check environment and binding parity

This is a source-derived list, not a live secret inventory. No credentials or
live secret values were read. Rex must obtain a names-only inventory from Bea
and reconcile additional owning API requirements before building a release.

| Names / bindings | Current Next production | Candidate / required parity |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase auth client | Isolated staging identity; production issuer port pending |
| `SUPABASE_SECRET_KEY`, legacy `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` | Server data access | No candidate data binding; port server-only access |
| `NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN`, `TUTURUUU_DEPLOY_ENV`, `NEXT_PUBLIC_TUTURUUU_STAGING` | Cookie/environment selection | Preserve production bytes; staging stays host-only |
| `AUTH_COOKIE_PREFIX`, `AUTH_COOKIE_DOMAIN` | Candidate-specific scope controls | `__Host-`; no staging domain attribute |
| `AUTH_RECOVERY_HASH_SECRET`, `TUTURUUU_AZURE_TENANT_ID` | Recovery / OAuth | Names-only parity and native implementation pending |
| `WEB_APP_URL`, `NEXT_PUBLIC_APP_URL`, external-app domain settings | Redirect and app origins | Admit canonical origins; reject untrusted return URLs |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Staging ingress | Required for verified Access JWTs |
| `WEB_START_CANDIDATE`, `WEB_START_NATIVE_LEGAL`, `WEB_START_NATIVE_SECURITY` | Not production inputs | Default off; staging-only gates |
| `ASSETS` | Vercel static delivery | Emitted client assets; Worker first; no HTML fallback |
| `MEET_AI_DISABLED`, `CRON_SECRET` | Existing API / scheduler controls | Preserve safety settings; owners must verify names-only inventory |

The candidate has no DB, KV, R2, AI, email or cron bindings. Its production
configuration and full env parity remain unqualified.

## Capture routes and rollback

Candidate: `tuturuuu-web-start-candidate`, isolated host `web.tutur3u.com`.
The checked-in candidate provisions no routes, workers.dev ingress or previews.
Production: `tuturuuu.com`; capture all aliases and path routes read-only before
changing any route. Keep Vercel available for rollback and in-flight callbacks.

The release ledger's last verified platform deployment is
`dpl_hqA4zPTTsC28WM7kRSy81m27S59j` (source `72d124eb`, read back by Rex on
4 November at 13:35 GMT+7). **This is historical evidence, not a fresh rollback
pin.** A read-only GitHub Production deployment lookup returned a 2024 record,
so it cannot establish the current live Vercel identity. Rex must read the
current alias target and retain its exact deployment id plus routing snapshot.
Missing fresh identity blocks cutover. No secret access is needed in this lane.

On regression, Rex restores the captured route/alias to that retained deployment
and verifies sign-in, callback and an authenticated read. Preserve cookies;
avoid introducing a new cookie format that the rollback issuer cannot read.
Expected planned downtime: zero with the retained origin and route restoration;
this remains unmeasured until staging proves in-flight session continuity.

## Run acceptance before the flip

1. Load `/`, `/login`, `/privacy`, `/vi/privacy` and authenticated workspace pages.
2. Sign in from a satellite, complete callback and return to its admitted URL.
3. Exercise MFA, refresh, logout, expired session and rejected return URL flows.
4. Create and read a disposable workspace task in isolated staging; check tenant
   isolation and no real-record access. Confirm production cookies never appear.
5. Check `.well-known/openid-configuration` and `.well-known/jwks.json` remain
   empty 404 responses, with no issuer metadata or cookie writes.
6. Verify source SHA, emitted Worker identity, API/image/static paths and cron
   ownership. Rehearse rollback before admitting production publication.

This code-only lane ran no hosted auth flow, production write, deploy or merge.

## Keep build inputs private

Only the GitHub-hosted candidate build receives
`NEXT_PUBLIC_SUPABASE_URL` from `secrets.PRODUCTION_SUPABASE_URL` and the
publishable key from `vars.PRODUCTION_SUPABASE_PUBLISHABLE_KEY`. No local or
i9 command reads those values. Public `NEXT_PUBLIC_*` and `VITE_*` values in
client bundles are expected. Do not print values in logs, upload env files or
secret dumps, or pass non-public secrets into client code or artifacts.
The build input is not exported to the artifact-sealing step. The sealed config
retains the existing isolated staging profile.
