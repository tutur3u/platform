import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { runtimeAppBase } from '../core/app-url';
import { prefixBase } from '../core/base-path';

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
        // Segment-aware and idempotent: a URL already under the base (a
        // build-time `base`) is left alone; external URLs pass through.
        return ({ url }) => prefixBase(url, base);
      },
    },
  });
  return { fetch: (request: Request) => fetch(request) };
}
