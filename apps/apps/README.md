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

Use Bun 1.4.4. Restore with `bun install --frozen-lockfile --ignore-scripts` only
under current restore admission. `bun run dev:app` runs local development on
port 7818; start a server only for authorized runtime verification. `bun run build` and
`bun run build:cloudflare` both invoke `vp build`; release builds belong in CI.
`bun run test` uses the isolated unit config. Its client and SSR resolvers select
the workspace `bun` source exports, so cold focused tests need no dependency
builds. Queue local tests with `ttr resources run -- bun run test`. `bun run test:runtime` requires
`CI=true`, `CI_SOURCE_SHA` and an absolute `APPS_ARTIFACT_RECEIPT` after the
native CI build. The receipt is the JSON written by
`python3 scripts/ci/apps-native-artifact.py seal apps/apps --receipt <path>`
(CI uses `$RUNNER_TEMP/apps-native-artifact.json`). The qualified source
baseline passed the owning CI acceptance gates.
New commits require their own exact-source qualification.

The runtime suite discovers the actual emitted config from
`.wrangler/deploy/config.json`, accepts empty auxiliary-worker metadata, and
requires a contained, unbundled artifact with existing staging identity and assets.
It launches the emitted Worker with disposable loopback auth/API fixtures, tests
both pages and all registered destinations, bilingual SSR with signed/anonymous
sessions, JS assets, build identity, API denial/body/query/cookie forwarding and
multiple response cookies. These finite fixtures do not qualify hosted SSO,
workspace permissions or actual external destinations. The runtime suite also discovers the real
compiler-emitted loader ID and exercises its RPC with signed/anonymous concurrent
requests, wrong target, wrong method and private-field exclusion. The qualified
baseline passed 9 HTTP/runtime groups and 6 browser groups on both original and
restored artifacts. Each artifact passed 120 redirect and
120 browser-anchor cases. Those results do not establish hosted acceptance, an
exact Chromium binary hash, internal descendant-process closure or historical
failure causes. Command launcher hydration and real session lifecycle still
require their own acceptance evidence.

## Identity and delivery

`void.config.ts` retains only the existing `tuturuuu-apps-vite-staging` identity.
The previous `wrangler.staging.jsonc` remains unchanged for rollback. No canonical
Worker name, account, domain route, secret, storage binding or resource is invented.
The canonical host is rejected unless the integration owner explicitly sets
`APPS_CANONICAL_HOST_ENABLED=1` after admitting its verified Worker mapping;
staging remains noindex through `TUTURUUU_NOINDEX=1`. The canonical
`apps.tuturuuu.com` currently has Vercel source configuration;
source configuration alone does not establish current hosted provider state.
Before cutover the integration owner must capture hosted mappings, current deployment, secret names and rollback
artifacts, select the admitted canonical Worker identity, qualify staging, then
use the existing promotion gates. Apps has no no-staging override.

Build through the Void SDK; discover, validate, seal and restore the complete
emitted `dist` and deploy-redirect artifacts; publish those exact bytes through the
existing Wrangler adapter only after promotion clearance. The Void CLI rebuilds
and may provision during preflight, so direct `void deploy` cannot substitute for
the exact-artifact gate. Do not provision Void DB/auth/storage or fork the SDK.

## Shared tooling and qualification

Root Vitest, coverage and the Vitest override are pinned to 5.0.5. Apps pins
Vite+ and its Vite alias to 1.3.0. Other Vite+ consumers require their own
applicable checks; the Apps result does not qualify every consumer.
The owning CI integrates app-local tests, emitted Worker acceptance and browser
navigation for original and restored artifacts. Preserve exact-commit build,
type, lint and test gates. The maintained
[Apps Cloudflare runbook](../docs/build/devops/apps-viteplus-cloudflare.mdx)
describes artifact validation, runtime limits and the separate promotion gates.
