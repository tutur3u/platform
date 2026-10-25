/// <reference lib="webworker" />
import { createOfflineWorker } from '../../../../packages/offline/src/worker';
import { cleanupLegacyCalendarCaches } from './legacy-offline-cache';
import { calendarOfflineContract, isNativeStaticAsset } from './offline-assets';

declare const self: ServiceWorkerGlobalScope & {
  __TUTURUUU_PRECACHE_MANIFEST: string[];
};
const basePath = new URL(self.registration.scope).pathname.replace(/\/$/u, '');
const contract = calendarOfflineContract(basePath);
self.__TUTURUUU_PRECACHE_MANIFEST = contract.precache;
createOfflineWorker({
  cacheNamespace: 'calendar',
  offlineFallbackUrl: contract.fallback,
  cacheNavigations: false,
  staticAssetsOnly: true,
  maxRuntimeCacheEntries: 160,
  additionalCaching: [
    {
      matcher: ({ request }) =>
        isNativeStaticAsset(request, self.location.origin, basePath),
      strategy: 'cache-first',
    },
  ],
}).addEventListeners();

self.addEventListener('activate', (event) => {
  event.waitUntil(
    cleanupLegacyCalendarCaches({
      origin: self.location.origin,
      storage: caches,
    })
  );
});
