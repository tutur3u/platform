import type { NextConfig } from 'next';
import type { TurbopackSerwistConfig } from './types';

/**
 * Gets the Next.js configuration additions required for Serwist with Turbopack.
 *
 * Unlike the webpack-based approach, this doesn't wrap your config.
 * Instead, it returns configuration to merge with your existing Next.js config.
 *
 * @param config - Configuration options
 * @returns Partial Next.js configuration to merge
 *
 * @example
 * ```ts
 * // In your next.config.ts:
 * import { getTurbopackConfig } from '@tuturuuu/offline/config';
 *
 * const serwistConfig = getTurbopackConfig();
 *
 * const nextConfig: NextConfig = {
 *   ...serwistConfig,
 *   // Your other config
 * };
 *
 * export default nextConfig;
 * ```
 */
export function getTurbopackConfig(
  config: TurbopackSerwistConfig = {}
): Partial<NextConfig> {
  const { additionalExternalPackages = [] } = config;

  return {
    // esbuild is required for on-the-fly service worker compilation
    serverExternalPackages: ['esbuild', ...additionalExternalPackages],
  };
}
