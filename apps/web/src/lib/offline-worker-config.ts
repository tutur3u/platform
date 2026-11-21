import type { OfflineRouteConfig } from '@tuturuuu/offline/route';

/**
 * The `/serwist/[path]` service worker. The Next.js route bundles it at
 * prerender time; vinext family builds bundle it before `vp build`
 * (cloudflare/vinext/service-worker.ts). Both read this config.
 */
export const WEB_OFFLINE_WORKER_CONFIG = {
  // Service worker source file
  swSrc: 'src/app/sw.ts',
  // Offline fallback page to precache
  offlineFallbackUrl: '/~offline',
  // Enable service worker in development for testing (default: disabled)
  disableInDev: true,
  // Avoid precaching every public asset on first visit; runtime/static HTTP
  // caching still serves public files normally.
  publicPrecachePatterns: false,
} as const satisfies OfflineRouteConfig;
