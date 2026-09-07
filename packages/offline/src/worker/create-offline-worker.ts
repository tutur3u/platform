import type {
  OfflineCacheStrategy,
  PrecacheEntry,
  RuntimeCachingRule,
  ServiceWorkerConfig,
} from './types';

declare global {
  interface WorkerGlobalScope {
    __TUTURUUU_PRECACHE_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// ServiceWorkerGlobalScope is defined in lib.webworker.d.ts
// This declaration ensures compatibility with TypeScript 7 (tsc)
declare interface ServiceWorkerGlobalScope extends WorkerGlobalScope {
  readonly clients: Clients;
  readonly registration: ServiceWorkerRegistration;
  skipWaiting(): Promise<void>;
}

declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'tuturuuu-offline';
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v1`;
const cacheWrites = new Map<string, Promise<void>>();
const cacheRecency = new Map<string, Map<string, number>>();
let accessOrder = 0;
function touchCache(cacheName: string, url: string) {
  const recency = cacheRecency.get(cacheName) ?? new Map<string, number>();
  recency.set(url, ++accessOrder);
  cacheRecency.set(cacheName, recency);
}

function createPrecacheName(entries: readonly (PrecacheEntry | string)[]) {
  const input = JSON.stringify(entries);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${CACHE_PREFIX}-precache-${(hash >>> 0).toString(36)}`;
}

function resolveEntryUrl(entry: PrecacheEntry | string) {
  return typeof entry === 'string' ? entry : entry.url;
}

function matchesRule(rule: RuntimeCachingRule, request: Request, url: URL) {
  if (typeof rule.matcher === 'function') {
    return rule.matcher({ request, url });
  }

  if (rule.matcher instanceof RegExp) {
    rule.matcher.lastIndex = 0;
    return rule.matcher.test(url.href);
  }

  return url.href.includes(rule.matcher);
}

async function fetchAndCache(
  request: Request,
  cacheName: string,
  maxEntries?: number,
  extendLifetime?: (promise: Promise<unknown>) => void
) {
  const response = await fetch(request);

  if (maxEntries === 0) return response;
  if (response.ok || response.type === 'opaque') {
    const cacheResponse = response.clone();
    const retain = async () => {
      try {
        const write = async () => {
          const cache = await caches.open(cacheName);
          if (maxEntries !== undefined) {
            const keys = (await cache.keys()).filter(
              (key) => key.url !== request.url
            );
            const recency = cacheRecency.get(cacheName);
            const retained = new Set(keys.map((key) => key.url));
            for (const url of recency?.keys() ?? []) {
              if (!retained.has(url)) recency?.delete(url);
            }
            keys.sort(
              (a, b) => (recency?.get(a.url) ?? 0) - (recency?.get(b.url) ?? 0)
            );
            await Promise.all(
              keys
                .slice(0, Math.max(0, keys.length - maxEntries + 1))
                .map((key) => {
                  recency?.delete(key.url);
                  return cache.delete(key);
                })
            );
          }
          await cache.put(request, cacheResponse);
          if (maxEntries !== undefined) touchCache(cacheName, request.url);
        };
        if (maxEntries !== undefined) {
          // Asset downloads finish concurrently; serialize writes so the bound holds.
          const pending = (cacheWrites.get(cacheName) ?? Promise.resolve())
            .catch(() => {})
            .then(write);
          cacheWrites.set(cacheName, pending);
          try {
            await pending;
          } finally {
            if (cacheWrites.get(cacheName) === pending)
              cacheWrites.delete(cacheName);
          }
        } else {
          await write();
        }
      } catch (error) {
        // Cache availability must never turn a successful network response into a failure.
        console.warn('[offline] Could not retain a runtime asset.', error);
      }
    };
    const retention = retain();
    if (extendLifetime) extendLifetime(retention);
    else await retention;
  }

  return response;
}

async function runStrategy(
  strategy: OfflineCacheStrategy,
  request: Request,
  cacheName: string,
  preloadResponse?: Promise<Response | undefined>,
  extendLifetime?: (promise: Promise<unknown>) => void,
  maxEntries?: number
): Promise<Response> {
  if (maxEntries === 0 || strategy === 'network-only')
    return strategy === 'cache-only'
      ? Response.error()
      : ((await preloadResponse) ?? fetch(request));
  const cache = await caches.open(cacheName).catch(() => null);
  if (!cache)
    return strategy === 'cache-only'
      ? Response.error()
      : ((await preloadResponse) ?? fetch(request));

  if (strategy === 'cache-only') {
    return (await cache.match(request)) ?? Response.error();
  }

  if (strategy === 'cache-first') {
    const cached = await cache.match(request);
    if (cached) {
      if (maxEntries !== undefined) touchCache(cacheName, request.url);
      return cached;
    }
    return fetchAndCache(request, cacheName, maxEntries, extendLifetime);
  }

  if (strategy === 'stale-while-revalidate') {
    const cached = await cache.match(request);
    const update = fetchAndCache(
      request,
      cacheName,
      maxEntries,
      extendLifetime
    );

    if (cached) {
      extendLifetime?.(
        update.catch((error) => {
          console.warn('[offline] Background cache refresh failed.', error);
        })
      );
    }

    return cached ?? update;
  }

  try {
    return (
      (await preloadResponse) ??
      (await fetchAndCache(request, cacheName, maxEntries, extendLifetime))
    );
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

export class TuturuuuServiceWorker {
  private readonly cacheNavigations: boolean;
  private readonly staticAssetsOnly: boolean;
  private readonly maxRuntimeCacheEntries: number | undefined;
  private readonly additionalCaching: RuntimeCachingRule[];
  private readonly clientsClaim: boolean;
  private readonly navigationPreload: boolean;
  private readonly offlineFallbackUrl: string;
  private readonly precacheEntries: (PrecacheEntry | string)[];
  private readonly precacheName: string;
  private readonly precacheUrls: Set<string>;
  private readonly skipWaiting: boolean;

  constructor(config: ServiceWorkerConfig = {}) {
    this.cacheNavigations = config.cacheNavigations ?? true;
    this.staticAssetsOnly = config.staticAssetsOnly ?? false;
    if (
      config.maxRuntimeCacheEntries !== undefined &&
      (!Number.isSafeInteger(config.maxRuntimeCacheEntries) ||
        config.maxRuntimeCacheEntries < 0)
    ) {
      throw new RangeError(
        'maxRuntimeCacheEntries must be a non-negative integer'
      );
    }
    this.maxRuntimeCacheEntries = config.maxRuntimeCacheEntries;
    this.offlineFallbackUrl = config.offlineFallbackUrl ?? '/~offline';
    this.skipWaiting = config.skipWaiting ?? true;
    this.clientsClaim = config.clientsClaim ?? true;
    this.navigationPreload = config.navigationPreload ?? true;
    this.additionalCaching = config.additionalCaching ?? [];
    this.precacheEntries = self.__TUTURUUU_PRECACHE_MANIFEST ?? [];
    this.precacheName = createPrecacheName(this.precacheEntries);
    this.precacheUrls = new Set(
      this.precacheEntries.map(
        (entry) => new URL(resolveEntryUrl(entry), self.location.origin).href
      )
    );
  }

  addEventListeners() {
    self.addEventListener('install', (event) => {
      (event as ExtendableEvent).waitUntil(this.install());
    });
    self.addEventListener('activate', (event) => {
      (event as ExtendableEvent).waitUntil(this.activate());
    });
    self.addEventListener('fetch', (event) => {
      const fetchEvent = event as FetchEvent;
      const response = this.handleFetch(fetchEvent);
      if (response) {
        fetchEvent.respondWith(response);
      }
    });
  }

  private async install() {
    const cache = await caches.open(this.precacheName);
    const urls = this.precacheEntries.map(resolveEntryUrl);
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);

        if (response.ok) {
          await cache.put(url, response);
        }
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('[offline] A precache request failed.', result.reason);
      }
    }

    if (this.skipWaiting) {
      await self.skipWaiting();
    }
  }

  private async activate() {
    if (this.maxRuntimeCacheEntries === 0) await caches.delete(RUNTIME_CACHE);
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (name) =>
            name.startsWith(`${CACHE_PREFIX}-precache-`) &&
            name !== this.precacheName
        )
        .map((name) => caches.delete(name))
    );

    if (this.navigationPreload && self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    if (this.clientsClaim) {
      await self.clients.claim();
    }
  }

  private handleFetch(event: FetchEvent) {
    const { request } = event;

    if (request.method !== 'GET') {
      return null;
    }

    const url = new URL(request.url);
    if (this.precacheUrls.has(url.href)) {
      return runStrategy('cache-first', request, this.precacheName);
    }
    const rule = this.additionalCaching.find((candidate) =>
      matchesRule(candidate, request, url)
    );

    if (rule) {
      return runStrategy(
        rule.strategy,
        request,
        rule.cacheName ?? RUNTIME_CACHE,
        event.preloadResponse,
        (promise) => event.waitUntil(promise),
        this.maxRuntimeCacheEntries
      );
    }

    if (request.mode === 'navigate') {
      return this.handleNavigation(event);
    }

    const publicAsset =
      url.pathname.startsWith('/_next/static/') ||
      /^\/(?:android-chrome-\d+x\d+|apple-touch-icon|favicon[^/]*)\.(?:png|ico|svg)$/.test(
        url.pathname
      );
    if (
      (!this.staticAssetsOnly || publicAsset) &&
      url.origin === self.location.origin &&
      ['font', 'image', 'script', 'style', 'worker'].includes(
        request.destination
      )
    ) {
      return runStrategy(
        this.staticAssetsOnly ? 'cache-first' : 'stale-while-revalidate',
        request,
        RUNTIME_CACHE,
        undefined,
        (promise) => event.waitUntil(promise),
        this.maxRuntimeCacheEntries
      );
    }

    return null;
  }

  private async handleNavigation(event: FetchEvent) {
    const response = this.cacheNavigations
      ? await runStrategy(
          'network-first',
          event.request,
          RUNTIME_CACHE,
          event.preloadResponse
        )
      : await (async () =>
          (await event.preloadResponse) ?? fetch(event.request))().catch(() =>
          Response.error()
        );

    if (response.type !== 'error') {
      return response;
    }

    const precache = await caches.open(this.precacheName);
    return (await precache.match(this.offlineFallbackUrl)) ?? Response.error();
  }
}

/**
 * Creates the configured Tuturuuu-owned service worker instance.
 *
 * @param config - Configuration options for the service worker
 * @returns A configured service worker ready to add event listeners
 *
 * @example
 * ```ts
 * // In your sw.ts file:
 * import { createOfflineWorker } from '@tuturuuu/offline/worker';
 *
 * const worker = createOfflineWorker();
 * worker.addEventListeners();
 * ```
 */
export function createOfflineWorker(config: ServiceWorkerConfig = {}) {
  return new TuturuuuServiceWorker(config);
}

/** @deprecated Use `createOfflineWorker`. */
export const createServiceWorker = createOfflineWorker;
