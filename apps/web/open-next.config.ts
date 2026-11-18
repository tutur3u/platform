// OpenNext config for apps/web family Workers (cloudflare/opennext). The
// Vercel build never reads it. API families are per-user dynamic, so there is
// no incremental cache, tag cache or revalidation queue: OpenNext's default
// no-op cache adds no billable background operations.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const config = defineCloudflareConfig({});
// Workspace packages are built by the CI job before this step; this runs only
// the Next build of the already pruned family tree.
config.buildCommand =
  process.env.NEXT_WEBPACK_BUILD === '1'
    ? 'bun x --no-install next build --webpack'
    : 'bun run build';
export default config;
