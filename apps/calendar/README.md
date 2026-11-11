# Calendar native Start candidate

The native renderer uses TanStack Start SSR, Vite+ and the official Void Cloudflare plugin. RSC is disabled. The retained `src/app`, Next config and Vercel config remain rollback and canonical product suppliers. They are not an upstream Calendar gateway.

The checked-in environment template is `env.example`. For admitted local setup, copy it to `.env`; Void1.1.12 supports that single local filename and rejects `.env.*` variants. The template itself is not loaded as local configuration.

Use Bun1.4.4 and the pinned workspace dependencies. Restore with `bun install --frozen-lockfile --ignore-scripts`; run native development with the existing `bun dev` launcher only when runtime work is admitted. `bun run build` invokes `vp build` and belongs in exact-source CI. This checkout's execution HOLD prohibits local tests, type checking, release builds, servers and provider actions. All new tests are authored but unrun. Dependency restore and Oxc parsing are separate evidence.

`cloudflare/worker.ts` runs the retained auth/locale proxy, then Tasks-owned API rewrites, Web reserved rewrites, Calendar's57 local API handlers, and Web fallback. Native page models resolve server data before browser composition; server functions use the native `/_calendar/functions` transport and Start CSRF middleware. The existing workspace selector and development realtime action use explicit POST ports. Task board snapshots share the portable injected resolver with the retained Next component.

The single offline registration is emitted by Vite's worker asset pipeline at `/serwist/sw.js`, scope `/`. The Worker serves it with `Service-Worker-Allowed: /` and no-cache. Public fallback dependencies are precached. Private API/document responses are not cached; static runtime assets retain the160-entry cap. CI must inspect the actual emitted URL and run the worker and registration tests; source configuration is not output proof.

The proposed frontend identity is `tuturuuu-calendar`. No domain/account binding, database, bucket, Durable Object, queue or schedule is introduced. The parent must establish hosting identity, secret names, existing provider/session/callback parity, exact emitted artifact acceptance and rollback before any cutover. Existing Infrastructure cron execution remains the only scheduled owner.

The request telemetry port isolates log-drain consumers without installing console hooks or adding SQL state. Disabled drain operation does not load Postgres. Enabled operation lazily delegates to the existing canonical supplier, extended only with optional background retention; its existing single SQL client and request AsyncLocalStorage remain the owner. No second connection pool or drain is authored. The native request passes the actual persistence promise to `ctx.waitUntil`. Worker Postgres compatibility and persisted outcomes still require runtime qualification before cutover.

Required parent evidence includes affected Web/Tasks/Calendar CI, compiler isolation of server suppliers, actual Worker SSR/hydration/navigation and locale/cookie isolation, OAuth state/consent/refresh/revocation, recurrence/unknown-provider outcomes, Tasks owner routing, emitted service worker policy, enabled telemetry and hosted rollback. No deployment command is added; qualify official SDK output and publish the exact accepted artifact through the existing Wrangler owner.

The artifact verifier accepts exactly one native `.wrangler/deploy/config.json` or Void-saved `.void/preview-deploy-config.json` pointer. Saved bytes retain the native directory as their relative-path base. Seal and archive the selected pointer with the complete emitted output; missing, duplicate, symlinked or changed pointers fail acceptance.

## Apex mount candidate

The production profile admits `tuturuuu.com/calendar` at the Worker boundary;
no zone route is installed. `TTR_ONE_ORIGIN_CALENDAR` is a Worker variable,
with missing or invalid values treated as `off` (apex 404, subdomain unchanged).
`shadow` serves the mount with noindex and no boundary redirects. `on` redirects
subdomain GET/HEAD document navigations to the apex with revocable 307/no-store;
API, assets, well-known, server functions and service-worker transport stay local.
The bridge's opt-in `mountedTrailingSlash` policy is configured with an
`on`-only predicate, so it stays off for missing/invalid modes and shadow.
When enabled, mounted GET/HEAD document slash URLs collapse to a bare path in
one 301 before the router, with the query preserved. The shared bridge defaults
to off for apps that omit the option; no other app is enabled here. Mounted Meet Together documents redirect outside Calendar
to `/meet-together`. The bare mount is slash-rewritten only for Start SSR; the
browser retains `/calendar` through hydration. Staging has no mount hosts.

Mounted mutations enforce the shared Origin/Fetch Metadata CSRF admission before
proxy or endpoint dispatch. The mounted logout, refresh-app-session and
verify-app-token endpoints retain their 409 refusal; Web owns the shared
session. Cookie names, attributes, paths and write behavior are unchanged, as
are root-host auth and OAuth behavior.

Exact-source CI must run the production-profile `vp build`, emitted-artifact
host scan (rootHosts and mountHosts), Calendar Vitest and all type-check targets,
then the emitted Worker on loopback with each public Host header and asset-smoke.
The execution HOLD above also applies to these receipts locally. Boundary and
mocked Start handoff tests do not establish actual SSR/hydration or asset output.
