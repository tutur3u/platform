import { createRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  canonicalAddress,
  hydrationBasepath,
  mountHeader,
  parseBasepath,
} from './request-boundary';
import { routeTree } from './routeTree.gen';

const serverSelectedBasepath = createIsomorphicFn()
  .server(() => parseBasepath(getRequest().headers.get(mountHeader)))
  .client(() => '/roadmap');

export function getRouter() {
  const basepath = serverSelectedBasepath();
  const router = createRouter({
    routeTree,
    basepath: '/roadmap',
    scrollRestoration: true,
  });
  router.update({
    dehydrate: () => ({ roadmapBasepath: basepath }),
    hydrate: (data: unknown) => {
      router.update({ basepath: hydrationBasepath(data) });
    },
  });
  if (typeof window !== 'undefined') {
    // The pinned router writes its basepath root as /roadmap/ into the
    // address bar after hydration. Tuturuuu URLs never end in a slash, so
    // restore /roadmap (same history state; this page has one route).
    const keepCanonical = () => {
      const target = canonicalAddress(window.location);
      if (target) window.history.replaceState(window.history.state, '', target);
    };
    router.subscribe('onResolved', keepCanonical);
    router.subscribe('onRendered', keepCanonical);
  }
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
