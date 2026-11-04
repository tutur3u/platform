# infrastructure Cloudflare cutover — Rex

Build on GitHub only: `cd apps/infrastructure && bun run build:cloudflare`.
The app-owned `infrastructure-cloudflare.yaml` uploads `infrastructure-cloudflare-<source SHA>`.
Download and extract `infrastructure-cloudflare.tar.gz` into an empty directory. Its
emitted Wrangler config is inside `dist` (resolve `configPath` in `.wrangler/deploy/config.json`).
Use that emitted config with `wrangler deploy --config <configPath>`.
Worker: `tuturuuu-infrastructure`. Assets: `dist/client`, binding `ASSETS`.
No deploy tokens are used by the build workflow.

| Name | Current production requirement | Worker parity |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | production project URL | CI public build value; also set Worker var |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | public production key | repository variable for build; Worker var |
| NEXT_PUBLIC_APP_URL | https://infrastructure.tuturuuu.com | CI value and Worker var |
| NEXT_PUBLIC_WEB_APP_URL | https://tuturuuu.com | CI value and Worker var |
| INTERNAL_WEB_API_ORIGIN | shared API origin | https://tuturuuu.com |
| SUPABASE_SECRET_KEY | server-side data access, if used | Bea/Rex copy by name only |
| TUTURUUU_APP_COORDINATION_SECRET | shared app session verification | Bea/Rex copy by name only |

This is a source inventory; Rex/Bea must reconcile actual production names without
sharing values. No D1, R2 or KV bindings are introduced by this conversion.

Routes: assign `infrastructure.tuturuuu.com` as a custom domain to `tuturuuu-infrastructure`.
The bridge also supports `tuturuuu.com/infrastructure`; tonight switch only the app domain.
Does it load: https://infrastructure.tuturuuu.com/ .
Optional follow-up smoke: load the home page, shared sign-in, then one core
create/read flow with a dedicated operator account. Tonight adds no test gate.
Rex checks the page loads after switching and flips back if dead.

ROLLBACK_POINTER

Expected downtime: no intentional outage; propagation and in-flight requests can
briefly see either origin. Leave the Vercel deployment available until accepted.
Security-review-required: yes (framework adapter reaches existing auth/data code).
Tonight follows Atlas/Pax cutover direction; no merge or deployment by this lane.

Selene conditions: workers_dev and preview_urls are false; unknown hosts reject.
CI inlines NODE_ENV=production, checks missing secrets return 503, checks anonymous
GET / redirects to /login and verifies unknown-host rejection. No local build/test.
The default build remains Next; build:legacy is identical, so the existing Vercel
build command is preserved without changing its project. CF CI explicitly runs
build:cloudflare. Remote Vercel project configuration was not read or changed.
Required startup secrets: TUTURUUU_APP_COORDINATION_SECRET, SUPABASE_SECRET_KEY.
Known gaps: no Worker scheduled trigger is configured. Monitoring cron routes
need explicit trigger ownership; cron.config.json output-file tracing from Next
is not automatically carried over. Internal-accounts employee beforeFiles rewrite
parity needs hosted confirmation. Direct Postgres paths need Hyperdrive review.
