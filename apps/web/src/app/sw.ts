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

/**
 * Mounts this worker must never answer at all, navigations included: a
 * response from Cache Storage or the offline page could stand in for the
 * mounted document, and any apex script can write Cache Storage. Activation
 * purges their cached entries, and a registration scoped under one
 * unregisters itself. See docs: build/devops/mastermind-web.
 */
const STRICT_ONE_ORIGIN_APP_PREFIXES = ['/mastermind'] as const;

const worker = createOfflineWorker({
  // Web's original cache names; changing this orphans installed caches.
  cacheNamespace: 'tuturuuu-offline',
  bypassPathPrefixes: ONE_ORIGIN_APP_PREFIXES,
  strictBypassPathPrefixes: STRICT_ONE_ORIGIN_APP_PREFIXES,
  // Route families deploy independently, so stored HTML can name chunks the
  // serving version no longer has. Pages always come from the network; only
  // the precached offline page answers a failed navigation.
  cacheNavigations: false,
});
worker.addEventListeners();
