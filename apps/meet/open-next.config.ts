import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

const config = defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
if (process.env.NEXT_WEBPACK_BUILD === '1') {
  config.buildCommand = 'bun x --no-install next build --webpack';
}
export default config;
