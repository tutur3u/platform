import { pageContext } from '../src/context.server';
import { assertProductionMode } from '../src/production-mode';
import { serve, type Environment } from '../src/worker';
declare global { interface CacheStorage { default: Cache } }
assertProductionMode(process.env.NODE_ENV);
export default {
  fetch(request: Request, env: Environment) {
    return serve(request, env, {
      fetch: globalThis.fetch,
      cache: caches.default,
      render: async (request, page) => {
        const { default: handler } = await import('@tanstack/react-start/server-entry');
        return pageContext.run(page, () => handler.fetch(request));
      },
    });
  },
};
