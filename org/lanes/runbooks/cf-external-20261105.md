# external cutover — Rex

Rule 13: Rex builds the exact upper PR head with production public env using
`cd apps/external && bun run build:cloudflare`; no local builds by this lane.
Deploy `dist/server/wrangler.json` to `tuturuuu-external`, assign only
`external.tuturuuu.com`. ASSETS serves dist/client. Does it load:
https://external.tuturuuu.com/ . CI artifact `external-cutover-<source SHA>` is optional.

Required runtime names: ASSETS, NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
TUTURUUU_APP_COORDINATION_SECRET.
Other public vars: NEXT_PUBLIC_APP_URL=https://external.tuturuuu.com,
NEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com; INTERNAL_WEB_API_ORIGIN=https://tuturuuu.com.
No signing-secret alias or development secret can replace the canonical secret.
Startup refuses missing bindings or a nonproduction server environment.
Workers.dev and preview URLs are off. Unknown hosts are rejected; apex mounts
are not admitted. CI executes the emitted Worker using synthetic credentials,
with NODE_ENV=development injected to prove the server compile-time guard wins.
Anonymous root must render 200.

Rollback: preserve the current `external.tuturuuu.com` Vercel alias and its
existing DNS target before switching. Read-only GitHub deployment lookup returned
no production record for External; exact Vercel deployment ID remains unresolved.
Rex must pin it via the Vercel account before switching, then restore that alias
and remove the Worker custom domain if loading fails.

Vercel's repository buildCommand invokes build:legacy with dependency builds;
build remains Next. Dashboard overrides were not queried or changed. Rex must
reconcile the live project setting before cutover. No intentional downtime;
propagation may briefly serve either origin. Keep Vercel available for rollback.

Known gaps: live authenticated create/read and server actions are unverified;
optional Upstash/abuse-guard bindings and production env parity need Rex/Bea
readback. No direct SQL/Hyperdrive binding or cron is introduced. Chat's
infrastructure-specific origin rewrite needs parity confirmation. APIs otherwise
use the existing central-first bridge. No merge or deploy by this lane.


Follow-up publication-policy scope: the cloudflareProductionTargets entry registers
this build-only workflow for selection. It has contents:read and no deployment
steps or credentials. Its omission from protectedSurfaces is intentional while
Rex performs the manual cutover; the legacy Vercel publisher remains admitted.
A future automated Cloudflare publisher needs its own explicit publication-policy
record when that publisher is introduced. No production policy is relaxed here.
The codemod now emits the production NODE_ENV definition, preserving regeneration.
