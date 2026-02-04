import { spawnSync } from 'node:child_process';
import { createSerwistRoute as createTurbopackRoute } from '@serwist/turbopack';
import type { SerwistRouteConfig, SerwistRouteResult } from './types';

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
 * Creates a Serwist route handler for Next.js App Router with Turbopack.
 *
 * This handler serves the service worker compiled on-the-fly using esbuild,
 * enabling Turbopack compatibility.
 *
 * @param config - Configuration options for the route handler
 * @returns Route handlers and config to export from your route.ts file
 *
 * @example
 * ```ts
 * // In your app/serwist/[path]/route.ts:
 * import { createSerwistRoute } from '@tuturuuu/offline/route';
 *
 * export const { GET, dynamic, dynamicParams, revalidate, generateStaticParams } =
 *   createSerwistRoute();
 * ```
 */
export function createSerwistRoute(
  config: SerwistRouteConfig = {}
): SerwistRouteResult {
  const {
    swSrc = 'src/app/sw.ts',
    offlineFallbackUrl = '/~offline',
    revision = getGitRevision(),
    disableInDev = true,
    globDirectory = '.',
    nextConfig = {},
  } = config;

  // Skip in development if disabled
  if (disableInDev && process.env.NODE_ENV === 'development') {
    return {
      dynamic: 'force-static',
      dynamicParams: false,
      revalidate: false,
      generateStaticParams: async () => [],
      GET: async () => {
        // 204 No Content - cannot have a body
        return new Response(null, {
          status: 204,
        }) as unknown as ReturnType<SerwistRouteResult['GET']>;
      },
    };
  }

  return createTurbopackRoute({
    swSrc,
    globDirectory,
    additionalPrecacheEntries: [{ url: offlineFallbackUrl, revision }],
    nextConfig: {
      basePath: nextConfig.basePath ?? '/',
      distDir: nextConfig.distDir ?? '.next',
      assetPrefix: nextConfig.assetPrefix,
    },
  });
}
