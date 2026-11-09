# Marketing Start + Void lane: status note (kv-B3, 2026-11-09)

Branch `feat/marketing-app-20261109`, PR #7934, Worker `tuturuuu-marketing-vite-staging`.

## Done
- Local build prerequisites verified:
  `bun turbo:local run build --filter='@tuturuuu/marketing^...' --concurrency=2`
- Resolved `renderToReadableStream` errors (dropped from 5 to 0):
  1. Wrapped `(marketing)/layout.tsx` with `<QueryProvider>` so landing page client components (`PricingSection`) have `QueryClient` context during SSR.
  2. Converted `PricingPage` to `async function` so `redirect('/?hash-nav=1#pricing')` is awaited prior to SSR streaming rather than throwing inside `renderToReadableStream`.
  3. Updated `apps/marketing/scripts/sync-messages.mjs` to extract `messages.*` properties (`commercialComparison`) from source files into `messages/{en,vi}.json`, resolving undefined `copy.features` in `CommercialComparison`.
  4. Updated `apps/marketing/start-bridge.routes.json` and `apps/marketing/cloudflare/native-built-worker.runtime.mjs` to declare `/pricing` expectation as `{ "redirect": "/" }`.
- Verified `build:cloudflare`, `test:runtime` (6/6 pass, 0 renderToReadableStream errors), and `type-check:cloudflare` pass cleanly.
- Authored runbook and architecture documentation `apps/docs/build/devops/marketing-start-void.mdx` and registered it in `apps/docs/docs.json`.
- Tested `bun check:changed`.

## Decisions
- `/download`, `/models`, `/changelog` (+ `[slug]`, OG/Twitter images) stay in `apps/web` on Vercel,
  as pass-through. They use Supabase `createClient`/`createAdminClient` (and `/download` per-request
  headers); `apps/web` has no public endpoint for them. Putting service keys on the Worker is
  forbidden, and adding endpoints means touching `apps/web`, so neither was done.
- No in-repo gateway flag exists for marketing page groups. Per-group rollback = Cloudflare route
  pattern per group (owner: Rex); removing a pattern returns that group to Vercel because `apps/web`
  is untouched.
