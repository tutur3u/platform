/// <reference lib="webworker" />
// Physical import is required by the deployed worker compiler's traced sources.
import { createOfflineWorker } from '../../../../packages/offline/src/worker';

createOfflineWorker({
  offlineFallbackUrl: '/offline.html',
  cacheNavigations: false,
  staticAssetsOnly: true,
  maxRuntimeCacheEntries: 160,
  // Never answer the Mastermind mount, whatever scope this worker is given
  // (docs: build/devops/mastermind-web).
  strictBypassPathPrefixes: ['/mastermind'],
}).addEventListeners();
