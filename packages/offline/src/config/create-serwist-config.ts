import { spawnSync } from 'node:child_process';
import withSerwistInit from '@serwist/next';
import type { SerwistNextConfig } from './types';

/**
 * Gets the current git revision hash for cache busting.
 * Falls back to a random UUID if git is not available.
 */
function getGitRevision(): string {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
    });
    return result.stdout?.trim() || crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * @deprecated Use `createSerwistRoute` from `@tuturuuu/offline/route` instead.
 * The webpack-based approach is being replaced by the Turbopack-compatible
 * route handler pattern. See migration guide for details.
 *
 * Creates a Serwist configuration wrapper for Next.js (webpack only).
 *
 * @param config - Configuration options for Serwist
 * @returns A function that wraps your Next.js config with Serwist
 *
 * @example
 * ```ts
 * // Migration: Replace this pattern:
 * import { createSerwistConfig } from '@tuturuuu/offline/config';
 * const withSerwist = createSerwistConfig();
 * export default withSerwist(nextConfig);
 *
 * // With the new route handler pattern:
 * // 1. Use getTurbopackConfig() in next.config.ts
 * // 2. Create app/serwist/[path]/route.ts with createSerwistRoute()
 * // 3. Add SerwistProvider to your layout
 * ```
 */
export function createSerwistConfig(config: SerwistNextConfig = {}) {
  console.warn(
    '[@tuturuuu/offline] createSerwistConfig is deprecated. ' +
      'Migrate to the Turbopack-compatible route handler pattern using ' +
      'createSerwistRoute() from @tuturuuu/offline/route. ' +
      'See https://github.com/serwist/serwist/issues/294 for details.'
  );
  const {
    swSrc = 'src/app/sw.ts',
    swDest = 'public/sw.js',
    offlineFallbackUrl = '/~offline',
    revision = getGitRevision(),
    disableInDev = false,
  } = config;

  // Skip service worker in development if disabled
  if (disableInDev && process.env.NODE_ENV === 'development') {
    return <T>(nextConfig: T): T => nextConfig;
  }

  return withSerwistInit({
    swSrc,
    swDest,
    additionalPrecacheEntries: [{ url: offlineFallbackUrl, revision }],
  });
}
