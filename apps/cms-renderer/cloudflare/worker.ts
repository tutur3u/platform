import handler from '@tanstack/react-start/server-entry';
import { pageContext } from '../src/context.server';
import { serve, type Environment } from '../src/worker';
declare global { interface CacheStorage { default: Cache } }
export default {
  fetch(request: Request, env: Environment) {
    return serve(request, env, {
      fetch: globalThis.fetch,
      cache: caches.default,
      render: (request, page) => pageContext.run(page, () => handler.fetch(request)),
    });
  },
};
