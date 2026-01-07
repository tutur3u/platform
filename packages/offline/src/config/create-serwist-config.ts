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
 * Creates a Serwist configuration wrapper for Next.js.
 *
 * @param config - Configuration options for Serwist
 * @returns A function that wraps your Next.js config with Serwist
 *
 * @example
 * ```ts
 * // In your next.config.ts:
 * import { createSerwistConfig } from '@tuturuuu/offline/config';
 *
 * const withSerwist = createSerwistConfig();
 *
 * export default withSerwist({
 *   // Your Next.js config
 * });
 * ```
 */
export function createSerwistConfig(config: SerwistNextConfig = {}) {
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
