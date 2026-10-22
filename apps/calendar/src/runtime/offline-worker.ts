/// <reference lib="webworker" />
import { createOfflineWorker } from '../../../../packages/offline/src/worker';
import { isNativeStaticAsset, offlinePrecache } from './offline-assets';

declare const self: ServiceWorkerGlobalScope & {
  __TUTURUUU_PRECACHE_MANIFEST: string[];
};
self.__TUTURUUU_PRECACHE_MANIFEST = offlinePrecache;
createOfflineWorker({
  offlineFallbackUrl: '/offline.html',
  cacheNavigations: false,
  staticAssetsOnly: true,
  maxRuntimeCacheEntries: 160,
  additionalCaching: [
    {
      matcher: ({ request }) =>
        isNativeStaticAsset(request, self.location.origin),
      strategy: 'cache-first',
    },
  ],
}).addEventListeners();
