/// <reference lib="webworker" />
// Physical import is required by the deployed worker compiler's traced sources.
import { createOfflineWorker } from '../../../../packages/offline/src/worker';
import { cleanupLegacyCalendarCaches } from '../runtime/legacy-offline-cache';

declare const self: ServiceWorkerGlobalScope;

createOfflineWorker({
  cacheNamespace: 'calendar',
  offlineFallbackUrl: '/offline.html',
  cacheNavigations: false,
  staticAssetsOnly: true,
  maxRuntimeCacheEntries: 160,
}).addEventListeners();

self.addEventListener('activate', (event) => {
  event.waitUntil(
    cleanupLegacyCalendarCaches({
      origin: self.location.origin,
      storage: caches,
    })
  );
});
