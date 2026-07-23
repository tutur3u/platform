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

async function fetchAndCache(request: Request, cacheName: string) {
  const response = await fetch(request);

  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }

  return response;
}

async function runStrategy(
  strategy: OfflineCacheStrategy,
  request: Request,
  cacheName: string,
  preloadResponse?: Promise<Response | undefined>,
  extendLifetime?: (promise: Promise<unknown>) => void
): Promise<Response> {
  const cache = await caches.open(cacheName);

  if (strategy === 'network-only') {
    return (await preloadResponse) ?? fetch(request);
  }

  if (strategy === 'cache-only') {
    return (await cache.match(request)) ?? Response.error();
  }

  if (strategy === 'cache-first') {
    return (await cache.match(request)) ?? fetchAndCache(request, cacheName);
  }

  if (strategy === 'stale-while-revalidate') {
    const cached = await cache.match(request);
    const update = fetchAndCache(request, cacheName);

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
    return (await preloadResponse) ?? (await fetchAndCache(request, cacheName));
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

export class TuturuuuServiceWorker {
  private readonly additionalCaching: RuntimeCachingRule[];
  private readonly clientsClaim: boolean;
  private readonly navigationPreload: boolean;
  private readonly offlineFallbackUrl: string;
  private readonly precacheEntries: (PrecacheEntry | string)[];
  private readonly precacheName: string;
  private readonly skipWaiting: boolean;

  constructor(config: ServiceWorkerConfig = {}) {
    this.offlineFallbackUrl = config.offlineFallbackUrl ?? '/~offline';
    this.skipWaiting = config.skipWaiting ?? true;
    this.clientsClaim = config.clientsClaim ?? true;
    this.navigationPreload = config.navigationPreload ?? true;
    this.additionalCaching = config.additionalCaching ?? [];
    this.precacheEntries = self.__TUTURUUU_PRECACHE_MANIFEST ?? [];
    this.precacheName = createPrecacheName(this.precacheEntries);
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
    const rule = this.additionalCaching.find((candidate) =>
      matchesRule(candidate, request, url)
    );

    if (rule) {
      return runStrategy(
        rule.strategy,
        request,
        rule.cacheName ?? RUNTIME_CACHE,
        event.preloadResponse,
        (promise) => event.waitUntil(promise)
      );
    }

    if (request.mode === 'navigate') {
      return this.handleNavigation(event);
    }

    if (
      url.origin === self.location.origin &&
      ['font', 'image', 'script', 'style', 'worker'].includes(
        request.destination
      )
    ) {
      return runStrategy(
        'stale-while-revalidate',
        request,
        RUNTIME_CACHE,
        undefined,
        (promise) => event.waitUntil(promise)
      );
    }

    return null;
  }

  private async handleNavigation(event: FetchEvent) {
    const response = await runStrategy(
      'network-first',
      event.request,
      RUNTIME_CACHE,
      event.preloadResponse
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
