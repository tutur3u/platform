import type { OfflineNextConfig } from './types';

/**
 * Compatibility wrapper for projects migrating from the former webpack
 * integration. Worker compilation is owned by `createOfflineRoute`, so the
 * Next.js config is intentionally passed through unchanged.
 */
export function createOfflineConfig(_config: OfflineNextConfig = {}) {
  return <T>(nextConfig: T): T => nextConfig;
}

/** @deprecated Use `createOfflineConfig`. */
export function createSerwistConfig(config: OfflineNextConfig = {}) {
  console.warn(
    '[@tuturuuu/offline] createSerwistConfig was replaced by ' +
      'createOfflineConfig and createOfflineRoute.'
  );
  return createOfflineConfig(config);
}
