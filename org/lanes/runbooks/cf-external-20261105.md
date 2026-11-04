# external Cloudflare cutover — Rex

Build on GitHub only: `cd apps/external && bun run build:cloudflare`.
The app-owned `external-cloudflare.yaml` uploads `external-cutover-<source SHA>`.
Download and extract `external-worker.tgz` into an empty directory. Its
emitted Wrangler config is inside `dist` (`find dist -name wrangler.json`).
Use that emitted config with `wrangler deploy --config <configPath>`.
Worker: `tuturuuu-external`. Assets: `dist/client`, binding `ASSETS`.
No deploy tokens are used by the build workflow.

| Name | Current production requirement | Worker parity |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | production project URL | CI public build value; also set Worker var |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | public production key | repository variable for build; Worker var |
| NEXT_PUBLIC_APP_URL | https://external.tuturuuu.com | CI value and Worker var |
| NEXT_PUBLIC_WEB_APP_URL | https://tuturuuu.com | CI value and Worker var |
| INTERNAL_WEB_API_ORIGIN | shared API origin | https://tuturuuu.com |
| SUPABASE_SECRET_KEY | server-side data access, if used | Bea/Rex copy by name only |
| TUTURUUU_APP_COORDINATION_SECRET | shared app session verification | Bea/Rex copy by name only |

This is a source inventory; Rex/Bea must reconcile actual production names without
sharing values. No D1, R2 or KV bindings are introduced by this conversion.

Routes: assign `external.tuturuuu.com` as a custom domain to `tuturuuu-external`.
The bridge also supports `tuturuuu.com/external`; tonight switch only the app domain.
Does it load: https://external.tuturuuu.com/ .
Optional follow-up smoke: load the home page, shared sign-in, then one core
create/read flow with a dedicated operator account. Tonight adds no test gate.
Rex checks the page loads after switching and flips back if dead.

Rollback: preserve the current `external.tuturuuu.com` Vercel alias and its
existing DNS target before switching. Read-only GitHub deployment lookup returned
no production record for External; exact Vercel deployment ID remains unresolved.
Rex must pin it via the Vercel account before switching, then restore that alias
and remove the Worker custom domain if loading fails.

Expected downtime: no intentional outage; propagation and in-flight requests can
briefly see either origin. Leave the Vercel deployment available until accepted.
Security-review-required: yes (framework adapter reaches existing auth/data code).
Tonight follows Atlas/Pax cutover direction; no merge or deployment by this lane.
