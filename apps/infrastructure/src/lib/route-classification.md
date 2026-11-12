# Infrastructure route classification preparation

`route-classification.ts` owns the exception allowlist. Its input is a canonical
route pattern and an exact uppercase HTTP method. Every unmatched pair is ADMIN.
Callers must resolve the canonical route before classification; this function is
not a URL parser or an authorization middleware.

`route-inventory.jsonl` enumerates 319 actual page/route source files and 429
method entries using the existing Start bridge classifier and exported-method
parser. The enumeration test compares APIs with the emitted bridge registry and
checks that every exception resolves to a source handler. There are five
exception entries: GET /login, POST /api/auth/logout, and GET for each of the
three /api/cron/infrastructure jobs (docker-recovery-alerts, sample-resources,
sync-trust-cache). There are no PUBLIC entries: no health handler exists and
build-info returns metadata beyond SHA and build time. Calendar remains ADMIN.

This is a preparation policy; existing handlers do not automatically invoke it.
The existing `authorizeInfrastructureAdminRequest` is the enforcement helper
for subsequent handler migration. Tests exercise that real helper with fixture
identity and permission suppliers, including unknown ADMIN paths, signed-out
401, root guest 403, and invalid bearer rejection despite an eligible cookie.
They do not prove every handler invokes that helper.

## Required enforcement and review gaps

- `src/app/api/auth/logout/route.ts` exports GET as well as POST and delegates
  to a central-host logout redirect. PRELOGIN requires POST with same-origin
  intent and relative redirects. GET is classified ADMIN here but is not guarded
  by the classification helper at runtime.
- `src/app/api/auth/verify-app-token/route.ts` and
  `src/app/api/auth/refresh-app-session/route.ts` delegate token/session issuance
  to cross-app factories. They remain ADMIN in this preparation; state/PKCE,
  same-origin redirect behavior and grant-free callback semantics require review.
- `src/app/api/build-info/route.ts` invokes the request-aware ADMIN helper on
  every GET before reading build metadata. Root MEMBER eligibility and
  view_infrastructure are required; signed-out requests return 401 and
  ineligible actors return 403. Authorization headers never fall back to cookies.
  The payload retains app name and platform version, so the route stays ADMIN.
  Its colocated route.test.ts exercises the real helper and factory with fixture
  identity/permission suppliers and asserts rejected requests cannot read metadata.
- The three dedicated infrastructure CRON handlers require a single Bearer token
  verified with fixed-size SHA-256 digests and Node timingSafeEqual before log
  drain or job effects. Missing secrets and invalid credentials return 401 with
  minimal status; cookies never grant access. Successful responses contain only
  ok. Job failures return minimal status and log no caught error payload.
  CRON_SECRET takes precedence over VERCEL_CRON_SECRET (including empty values).
  Handler-effect coverage lives in infrastructure-cron-auth.test.ts; Docker
  email and watermark behavior also has colocated regression coverage.
- `src/app/api/cron/calendar/[job]/route.ts` is outside the dedicated exception
  list. Its job dispatcher needs separate acceptance; Calendar remains held.
- All remaining inventory entries require per-handler/page acceptance for session,
  root membership and view_infrastructure or a specific manage permission. An
  imported guard alone cannot prove each exported method invokes it. Workspace
  helper wrappers can omit the request, so bearer/cookie equivalence must be
  checked at each call site. No blanket auth acceptance is claimed.
- Landing-page ADMIN behavior, login state/PKCE and redirects need runtime review.

Selene owns independent source and final authentication acceptance. Pax owns
publication and integration. Rename integration retains the PR-A-first condition.
Source tests provide no emitted Worker, production build, staging, cutover or
production authorization evidence.
