import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';
import type { ServiceWorkerConfig } from './types';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// ServiceWorkerGlobalScope is defined in lib.webworker.d.ts
// This declaration ensures compatibility with TypeScript Go (tsgo)
declare interface ServiceWorkerGlobalScope extends WorkerGlobalScope {
  readonly clients: Clients;
  readonly registration: ServiceWorkerRegistration;
  skipWaiting(): Promise<void>;
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Creates a configured Serwist service worker instance.
 *
 * @param config - Configuration options for the service worker
 * @returns A configured Serwist instance ready to add event listeners
 *
 * @example
 * ```ts
 * // In your sw.ts file:
 * import { createServiceWorker } from '@tuturuuu/offline/worker';
 *
 * const serwist = createServiceWorker();
 * serwist.addEventListeners();
 * ```
 */
export function createServiceWorker(config: ServiceWorkerConfig = {}) {
  const {
    offlineFallbackUrl = '/~offline',
    skipWaiting = true,
    clientsClaim = true,
    navigationPreload = true,
    additionalCaching = [],
  } = config;

  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting,
    clientsClaim,
    navigationPreload,
    runtimeCaching: [...defaultCache, ...additionalCaching],
    fallbacks: {
      entries: [
        {
          url: offlineFallbackUrl,
          matcher({ request }) {
            return request.destination === 'document';
          },
        },
      ],
    },
  });

  return serwist;
}
