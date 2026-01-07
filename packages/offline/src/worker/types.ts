import type { RuntimeCaching } from 'serwist';

export interface ServiceWorkerConfig {
  /**
   * URL of the offline fallback page
   * @default '/~offline'
   */
  offlineFallbackUrl?: string;

  /**
   * Whether to skip waiting and immediately activate new service worker
   * @default true
   */
  skipWaiting?: boolean;

  /**
   * Whether to claim all clients immediately
   * @default true
   */
  clientsClaim?: boolean;

  /**
   * Whether to enable navigation preload
   * @default true
   */
  navigationPreload?: boolean;

  /**
   * Additional runtime caching strategies
   */
  additionalCaching?: RuntimeCaching[];
}
