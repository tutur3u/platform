import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

const config = defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
const nextBuild =
  process.env.NEXT_WEBPACK_BUILD === '1'
    ? 'bun x --no-install next build --webpack'
    : 'bun run build';
config.buildCommand = `bun x --no-install turbo run build --filter='@tuturuuu/meet^...' && ${nextBuild}`;
export default config;
