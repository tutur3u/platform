import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { runtimeAppBase } from '../core/app-url';

/**
 * The Start request handler for a bridged app. Script and stylesheet URLs in
 * the SSR manifest get the current request's base, so one artifact serves
 * its subdomain root and the apex mount. Use it in place of
 * `@tanstack/react-start/server-entry` as `createBridgeHandler({ start })`.
 */
export function createBridgeStartHandler() {
  const fetch = createStartHandler({
    handler: defaultStreamHandler,
    transformAssets: {
      cache: false,
      createTransform: (context) => {
        const base = context.warmup ? '' : runtimeAppBase();
        return ({ url }) =>
          base && url.startsWith('/') && !url.startsWith('//')
            ? `${base}${url}`
            : url;
      },
    },
  });
  return { fetch: (request: Request) => fetch(request) };
}
