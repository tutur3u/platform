export type OfflineCacheStrategy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only'
  | 'cache-only';

export interface OfflineRequestContext {
  request: Request;
  url: URL;
}

export interface RuntimeCachingRule {
  /**
   * Match a request by URL pattern or a custom synchronous predicate.
   */
  matcher: string | RegExp | ((context: OfflineRequestContext) => boolean);

  strategy: OfflineCacheStrategy;
  cacheName?: string;
}

export interface PrecacheEntry {
  revision?: string | null;
  url: string;
}

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
  additionalCaching?: RuntimeCachingRule[];
}
