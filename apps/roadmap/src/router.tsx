import { createRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
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
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
