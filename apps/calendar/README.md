# Calendar native Start candidate

The native renderer uses TanStack Start SSR, Vite+ and the official Void Cloudflare plugin. RSC is disabled. The retained `src/app`, Next config and Vercel config remain rollback and canonical product suppliers. They are not an upstream Calendar gateway.

The checked-in environment template is `env.example`. For admitted local setup, copy it to `.env`; Void1.1.12 supports that single local filename and rejects `.env.*` variants. The template itself is not loaded as local configuration.

Use Bun1.4.4 and the pinned workspace dependencies. Restore with `bun install --frozen-lockfile --ignore-scripts`; run native development with the existing `bun dev` launcher only when runtime work is admitted. `bun run build` invokes `vp build` and belongs in exact-source CI. This checkout's execution HOLD prohibits local tests, type checking, release builds, servers and provider actions. All new tests are authored but unrun. Dependency restore and Biome parsing are separate evidence.

`cloudflare/worker.ts` runs the retained auth/locale proxy, then Tasks-owned API rewrites, Web reserved rewrites, Calendar's57 local API handlers, and Web fallback. Native page models resolve server data before browser composition; server functions use the native `/_calendar/functions` transport and Start CSRF middleware. The existing workspace selector and development realtime action use explicit POST ports. Task board snapshots share the portable injected resolver with the retained Next component.

The single offline registration is emitted by Vite's worker asset pipeline at `/serwist/sw.js`, scope `/`. The Worker serves it with `Service-Worker-Allowed: /` and no-cache. Public fallback dependencies are precached. Private API/document responses are not cached; static runtime assets retain the160-entry cap. CI must inspect the actual emitted URL and run the worker and registration tests; source configuration is not output proof.

The proposed frontend identity is `tuturuuu-calendar`. No domain/account binding, database, bucket, Durable Object, queue or schedule is introduced. The parent must establish hosting identity, secret names, existing provider/session/callback parity, exact emitted artifact acceptance and rollback before any cutover. Existing Infrastructure cron execution remains the only scheduled owner.

The request telemetry port isolates log-drain consumers without installing console hooks or adding SQL state. Disabled drain operation does not load Postgres. Enabled operation lazily delegates to the existing canonical supplier, extended only with optional background retention; its existing single SQL client and request AsyncLocalStorage remain the owner. No second connection pool or drain is authored. The native request passes the actual persistence promise to `ctx.waitUntil`. Worker Postgres compatibility and persisted outcomes still require runtime qualification before cutover.

Required parent evidence includes affected Web/Tasks/Calendar CI, compiler isolation of server suppliers, actual Worker SSR/hydration/navigation and locale/cookie isolation, OAuth state/consent/refresh/revocation, recurrence/unknown-provider outcomes, Tasks owner routing, emitted service worker policy, enabled telemetry and hosted rollback. No deployment command is added; qualify official SDK output and publish the exact accepted artifact through the existing Wrangler owner.

The artifact verifier accepts exactly one native `.wrangler/deploy/config.json` or Void-saved `.void/preview-deploy-config.json` pointer. Saved bytes retain the native directory as their relative-path base. Seal and archive the selected pointer with the complete emitted output; missing, duplicate, symlinked or changed pointers fail acceptance.
