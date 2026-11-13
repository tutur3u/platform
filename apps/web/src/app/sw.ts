// This file is compiled inside the deployed route at request time. Keep the
// worker implementation as a physical monorepo-relative import so esbuild does
// not depend on workspace package symlinks that Vercel omits from the function.
import { createOfflineWorker } from '../../../../packages/offline/src/worker';

/**
 * Apps mounted on the shared `tuturuuu.com` origin. Web's worker is registered
 * at scope `/`, so without this it would control their pages and serve Web's
 * offline page for them. See docs: platform/architecture/one-origin-super-app.
 */
const ONE_ORIGIN_APP_PREFIXES = [
  '/apps',
  '/calendar',
  '/chat',
  '/cms',
  '/contacts',
  '/design',
  '/drive',
  '/finance',
  '/forms',
  '/inventory',
  '/learn',
  '/mail',
  '/meet',
  '/mind',
  '/pay',
  '/roadmap',
  '/store',
  '/tasks',
  '/teach',
  '/tools',
  '/track',
] as const;

const worker = createOfflineWorker({
  // Web's original cache names; changing this orphans installed caches.
  cacheNamespace: 'tuturuuu-offline',
  bypassPathPrefixes: ONE_ORIGIN_APP_PREFIXES,
});
worker.addEventListeners();
