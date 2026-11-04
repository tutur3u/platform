# infrastructure cutover for Rex

Build the exact pushed PR head with production public configuration. Rex owns
local builds and deployment under rule 13; CI is a later check. This lane runs no
local installs or builds. From the repository root, build workspace suppliers:

```sh
bun turbo:local run build --filter="@tuturuuu/infrastructure^..." --concurrency=2
cd apps/infrastructure
bun run build:cloudflare
```

The Worker build is `build:cloudflare` (`vp build --configLoader runner`). The
default `build` and `build:legacy` still run Next to preserve Vercel behavior.
Do not use the app's default `build` to produce the Worker.

The app-owned `infrastructure-cloudflare.yaml` packages `infrastructure-cloudflare-<source SHA>`.
Extract `infrastructure-cloudflare.tar.gz` into an empty directory. Resolve `configPath`
from `.wrangler/deploy/config.json` relative to `.wrangler/deploy/`, then use
`wrangler deploy --config <resolved path>`. Keep the emitted `dist` layout intact.
Worker: `tuturuuu-infrastructure`. Asset binding: `ASSETS`, from `dist/client`.

| Name | Requirement |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Production public build URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Production public build key |
| NEXT_PUBLIC_APP_URL | https://infrastructure.tuturuuu.com |
| NEXT_PUBLIC_WEB_APP_URL | https://tuturuuu.com |
| INTERNAL_WEB_API_ORIGIN | Shared web API origin |
| SUPABASE_SECRET_KEY | Required startup/server secret; provision by name only |
| TUTURUUU_APP_COORDINATION_SECRET | Required startup/session secret; provision by name only |
| CRON_SECRET | Required for cron HTTP calls; existing VERCEL_CRON_SECRET fallback is supported |

Infrastructure has **5 Vercel crons and no Worker scheduled trigger**. All five
are cutover gaps until Rex assigns and verifies their scheduler ownership; they
do not migrate by copying HTTP routes. CRON_SECRET (or existing legacy
VERCEL_CRON_SECRET) is required for their authenticated HTTP calls.

| Existing Vercel path | Schedule | Cloudflare status |
| --- | --- | --- |
| `/api/cron/infrastructure/sample-resources` | `* * * * *` | No scheduled trigger |
| `/api/cron/infrastructure/docker-recovery-alerts` | `*/5 * * * *` | No scheduled trigger |
| `/api/cron/infrastructure/sync-trust-cache` | `*/10 * * * *` | No scheduled trigger |
| `/api/cron/calendar/provider-sync` | `*/15 * * * *` | No scheduled trigger |
| `/api/cron/calendar/smart-schedule` | `0 */6 * * *` | No scheduled trigger |

Additional gaps: Next output-file tracing of cron.config.json is not automatically
carried over. Confirm the internal-accounts employee rewrite in the hosted app.
Any direct Postgres path needs Hyperdrive review.

Active runtime check: `CI=true bun run test:runtime` uses
`cloudflare/native-auth.runtime.mjs`. It checks startup-secret refusal, anonymous
`/` to `/login`, and unknown-host rejection. Runtime has not been executed by
this lane. CI also records the emitted configuration receipt.

Ingress: workers_dev=false, preview_urls=false and unknownHost=reject. Production
NODE_ENV is defined at build time; startup refuses to serve without production
mode and both required startup secrets. Rex must verify the built server bytes.

Domain: `infrastructure.tuturuuu.com`; retain existing `tuturuuu.com/infrastructure` routing as
applicable. Load check: https://infrastructure.tuturuuu.com/ . Follow-up smoke covers shared
sign-in and one core create/read flow with an operator fixture.

Rollback: before switching, Rex records the existing origin/domain route and its
current deployment or Worker version. This lane has not pinned that deployment.
Restore the saved origin/route immediately if the Worker fails to load. No database
migration is included. Keep the existing production deployment available.

Expected downtime: no intentional outage; route propagation is unmeasured.
Merge only the full reviewed chain or a squash of the top PR. Earlier wiring
layers are incomplete independently. Security review remains required. No merge
or deploy is performed by this lane. Shared startup-helper adoption is a separate
follow-up after its dependency merges; it is not part of this build head.
