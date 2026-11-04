# hive cutover for Rex

Build: `bun turbo:local run build --filter=@tuturuuu/hive --concurrency=2` on GitHub CI only. Own workflow: `.github/workflows/hive-cloudflare.yaml`. Artifact: `hive-cloudflare-<full source SHA>` contains `hive-cloudflare.tar.gz`.

Extract into an empty directory. Read `.wrangler/deploy/config.json`; resolve its `configPath` relative to `.wrangler/deploy/`. Deploy with `wrangler deploy --config <resolved path>`. Worker: `tuturuuu-hive`. The emitted config and assets are under `dist/`; keep the directory layout intact.

| Name | Current production to Worker parity |
| --- | --- |
| ASSETS | Generated `dist/client`; Worker asset binding |
| NEXT_PUBLIC_SUPABASE_URL | Existing production Supabase URL, build input |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Existing public key, repository variable build input |
| SUPABASE_SECRET_KEY | Rex/Bea provision runtime secret if required by existing server helpers |
| INTERNAL_WEB_API_ORIGIN | Shared web API origin; defaults to https://tuturuuu.com |
| TUTURUUU_APP_COORDINATION_SECRET | Preserve existing app-session coordination secret if used |

Rex must reconcile app-specific runtime names against existing production before upload; no secret values are in this runbook. No database migration is part of this change.

Domain: `hive.tuturuuu.com`; preserve the `/hive` mount on tuturuuu.com where currently routed. Source stays route-free until Rex switches the domain.

Smoke: load https://hive.tuturuuu.com/; sign in through shared web auth; load one existing core page and perform one core create/read flow with the operator's fixture. Tonight only the load check gates Rex's cutover; the remaining checks are follow-up coverage.

Rollback: retain current Vercel production alias `hive.tuturuuu.com` and its deployment. The current deployment ID has not been resolved by this code-only lane; Rex must pin it by read-only lookup before switching. Restore the previous domain/origin route immediately if the Worker fails to load. No data/schema rollback.

Expected downtime: route propagation only; duration unmeasured. No service interruption is intended. Security review is required for the separate auth/data adapter PRs; no merge/deploy is authorized to this lane.
