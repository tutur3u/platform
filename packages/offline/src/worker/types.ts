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
  /** Defaults to the namespaced runtime cache; a custom name is not namespaced. */
  cacheName?: string;
}

export interface PrecacheEntry {
  revision?: string | null;
  url: string;
}

export interface ServiceWorkerConfig {
  /**
   * Prefix for this app's precache and runtime cache names. Apps sharing one
   * origin need distinct namespaces: activation prunes stale precaches only
   * within its own namespace. Lowercase letters and digits joined by hyphens.
   * @default 'tuturuuu-offline' (Web's original cache names)
   */
  cacheNamespace?: string;

  /** Keep authenticated HTML out of disk caches. Defaults to true for legacy hosts. */
  cacheNavigations?: boolean;
  /** Cache only hashed Next assets and public app icons, never API/private images. */
  staticAssetsOnly?: boolean;
  /** Maximum number of on-demand assets retained on this origin. */
  maxRuntimeCacheEntries?: number;

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
   * Same-origin path prefixes owned by another app (for example `/meet` on the
   * shared `tuturuuu.com` origin). The worker never caches them or serves its
   * offline fallback for them; navigations reuse the preload response so the
   * browser does not fetch them twice. Each prefix starts with `/` and has no
   * trailing slash, and matches itself and its descendants only.
   */
  bypassPathPrefixes?: readonly string[];

  /**
   * Additional runtime caching strategies
   */
  additionalCaching?: RuntimeCachingRule[];
}
