# Apps native Start candidate

The active package commands use plain TanStack Start SSR, Vite+ and the official
Void SDK. `src/router.tsx` implements the catalogue; the Worker redirects registered apps
from the original Request URL before Router search serialization.
`cloudflare/worker.ts` owns request context, shared locale cookies, build-info,
static assets and the guarded central API boundary. Existing Next page/layout,
proxy and portable staging sources are retained as rollback references; they are
not the active Vite entry. No RSC adapter or new auth/database provider is enabled.

The catalogue preserves the production UI, English/Vietnamese messages, category
and alias search, external app navigation, command launcher, satellite sessions,
workspace visibility, theme and staff version badge. Loaders expose actor ID and
public release metadata; never serialize full profiles or session objects.
Existing Next Web request/response/cookie implementations remain dependencies of
shared security/auth helpers. App-local adapters provide request-scoped headers
and cookies and native navigation/translation hooks. They do not implement Next
RSC, route handlers or a second rendering framework.

## Commands and qualification

Use Bun 1.4.3. Restore with `bun install --frozen-lockfile --ignore-scripts` only
under current restore admission. `bun run dev:app` runs local development on7818;
start a server only for authorized runtime verification. `bun run build` and
`bun run build:cloudflare` both invoke `vp build`; release builds belong in CI.
`bun run test` uses the isolated unit config. `bun run test:runtime` requires
`CI=true` and `CI_SOURCE_SHA` after the native CI build. Tests in this candidate
are authored, not executed. Do not infer acceptance from these commands existing.

The runtime suite discovers the actual emitted config from
`.wrangler/deploy/config.json`, accepts empty auxiliary-worker metadata, and
requires a contained, unbundled artifact with existing staging identity and assets.
It launches the emitted Worker with disposable loopback auth/API fixtures, tests
both pages and all registered destinations, bilingual SSR with signed/anonymous
sessions, JS assets, build identity, API denial/body/query/cookie forwarding and
multiple response cookies. Fixtures are not hosted SSO, browser hydration,
workspace permission or actual external destination acceptance. The runtime suite also discovers the real compiler-emitted loader ID and exercises
its RPC with signed/anonymous concurrent requests, wrong target, wrong method and
private-field exclusion. The parent must execute these tests and also verify
command launcher hydration and real session lifecycle in CI/browser.

## Identity and delivery

`void.config.ts` retains only the existing `tuturuuu-apps-vite-staging` identity.
The previous `wrangler.staging.jsonc` remains unchanged for rollback. No canonical
Worker name, account, domain route, secret, storage binding or resource is invented.
The canonical host is rejected unless the integration owner explicitly sets
`APPS_CANONICAL_HOST_ENABLED=1` after admitting its verified Worker mapping;
staging remains noindex through `TUTURUUU_NOINDEX=1`. The canonical
`apps.tuturuuu.com` currently has Vercel source configuration;
provider state has not been read in this lane. Before cutover the integration
owner must capture hosted mappings, current deployment, secret names and rollback
artifacts, select the admitted canonical Worker identity, qualify staging, then
use the existing promotion gates. This task has no no-staging override.

Build through the Void SDK; discover, validate, seal and restore the complete
emitted `dist` and deploy-redirect artifacts; publish those exact bytes through the
existing Wrangler adapter only after promotion clearance. The Void CLI rebuilds
and may provision during preflight, so direct `void deploy` cannot substitute for
the exact-artifact gate. Do not provision Void DB/auth/storage or fork the SDK.

## Parent integration requirements

Reconcile the private child lock delta through Bun; do not graft the root lock.
Align root Vitest/coverage/override to5.0.5 with the parent's admitted change before
qualifying Vite+1.3.0; this child does not own root pins. Existing Vite+1.1.0
consumers need affected-consumer checks. Integrate the app-local tests and emitted
Worker suite in the owning CI, retain exact-commit build/type/lint/test gates,
and update the maintained platform/Cloudflare runbooks and skill references.
No shared source, CI or docs outside this app was changed by this lane.
