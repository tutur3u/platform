# Marketing Start + Void lane: resume note (kv-B2, 2026-11-09)

Branch `feat/marketing-app-20261109`, PR #7934, Worker `tuturuuu-marketing-vite-staging`.

## Done
- Worktree `../tuturuuu-wt-marketing-20261109`, `bun install --frozen-lockfile --ignore-scripts`.
- Local build prerequisites: workspace `dist/` outputs must exist first, or Rolldown cannot resolve
  `@tuturuuu/supabase/next/proxy` or `@tuturuuu/internal-api`:
  `bun turbo:local run build --filter='@tuturuuu/marketing^...' --concurrency=2`
- `build:cloudflare` passes. `CI=true bun run test:runtime` passes 6/6 on head f8f5fbcb51
  (pages answer 200 as start-bridge.routes.json expects, root host, 404 policy).
- Found a real defect the tests do not catch: every page logs `Error in renderToReadableStream`
  (use-intl "no intl context") from `marketing-nav-menu.tsx` `useTranslations`. The navbar and footer
  sit in `(marketing)/layout.tsx`, above `(marketing)/template.tsx` where NextIntlClientProvider was.
  Pages still return 200 because React falls back to client render, so SSR of the nav was broken.
- Fix (committed, NOT yet rebuilt or retested): provider moved into `(marketing)/layout.tsx`
  (async, wraps navbar + page + footer), `template.tsx` deleted, template imports removed from
  `src/start-bridge/page-modules.bridge.gen.ts` (the codemod generates that file; no CLI regenerates it,
  so it was sed-edited. `start-bridge-routes check apps/marketing` still reports current).

## Decisions
- `/download`, `/models`, `/changelog` (+ `[slug]`, OG/Twitter images) stay in `apps/web` on Vercel,
  as pass-through. They use Supabase `createClient`/`createAdminClient` (and `/download` per-request
  headers); `apps/web` has no public endpoint for them. Putting service keys on the Worker is
  forbidden, and adding endpoints means touching `apps/web`, so neither was done.
- No in-repo gateway flag exists for marketing page groups. Per-group rollback = Cloudflare route
  pattern per group (owner: Rex); removing a pattern returns that group to Vercel because `apps/web`
  is untouched. The packet must say this plainly rather than invent a flag.

## Next (in order)
1. Regenerate build identity, rebuild, retest, confirm the `renderToReadableStream` errors are gone:
   ```
   cd apps/marketing; SHA=$(git rev-parse HEAD)
   export MARKETING_SOURCE_SHA=$SHA CI=true CI_SOURCE_SHA=$SHA \
     NEXT_PUBLIC_SUPABASE_URL=https://marketing-ci.supabase.invalid \
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_marketing_ci_placeholder \
     NEXT_PUBLIC_APP_URL=https://marketing.tuturuuu.com NEXT_PUBLIC_WEB_APP_URL=https://tuturuuu.com \
     TUTURUUU_NOINDEX=1 PLATFORM_BUILD_COMMIT_HASH=$SHA PLATFORM_BUILD_REF_NAME=feat/marketing-app-20261109 \
     PLATFORM_BUILD_ENVIRONMENT=preview
   (cd ../.. && bun run --silent scripts/ci/generate-build-metadata.ts)
   bun run build:cloudflare && bun run test:runtime 2>&1 | grep -c renderToReadableStream
   bun run type-check:cloudflare
   git -C ../.. checkout packages/utils/src/generated/platform-build-metadata.ts   # never commit it
   ```
   If errors remain, the `useTranslations` call is hit before the provider settles; check
   `packages/start-bridge/src/rsc/next-intl.tsx` and other client components outside the layout.
2. Write `apps/docs/build/devops/marketing-start-void.mdx` (model: `shortener-start-void.mdx`) and add it
   to `apps/docs/docs.json`: Worker name, route list per page group (from `start-bridge.routes.json`
   `runtime`), bindings (`ASSETS`; vars `TUTURUUU_NOINDEX`, optional `INTERNAL_WEB_API_ORIGIN`, no
   secrets), build command (`cd apps/marketing && bun run build:cloudflare` after the turbo dependency
   build), pass-through list above, smoke `curl -s -o /dev/null -w '%{http_code}' https://<host>/privacy`
   (also /terms /security /vi/privacy) = 200 with `x-tuturuuu-runtime: native`, rollback as above.
3. `bun check:changed`, then push, then update PR #7934 body, label `ready-for-ci`.
4. Constraints from the order: author vhpx, no Co-authored-by, Conventional Commits, no deploys/DNS/
   provider writes, no secrets, never pkill by pattern.
