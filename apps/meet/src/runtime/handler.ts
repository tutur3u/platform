import start from '@tanstack/react-start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { proxy } from '../proxy';
import { dispatchMeetEndpoint } from './api-registry';
import { MEET_FUNCTION_BASE } from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { dispatchThroughMeetProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { observeMeetSsr } from './ssr-diagnostics';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

export function handleMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext
) {
  return observeMeetSsr('handler', () =>
    dispatchMeetRequest(request, env, ctx)
  );
}

function dispatchMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext
) {
  const path = new URL(request.url).pathname;
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') || publicAssets.has(path))
  ) {
    if (!env.ASSETS) throw new Error('Meet assets binding is unavailable');
    return env.ASSETS.fetch(request);
  }
  return dispatchThroughMeetProxy({
    request,
    proxy:
      path === MEET_FUNCTION_BASE || path.startsWith(`${MEET_FUNCTION_BASE}/`)
        ? nativeFunctionProxy
        : proxy,
    waitUntil: (work) => ctx.waitUntil(work),
    cloudflare: { env, ctx },
    dispatch: async (forwarded) => {
      const endpoint = await dispatchMeetEndpoint(forwarded);
      if (endpoint) return endpoint;
      if (forwarded.nextUrl.pathname.startsWith('/api/')) {
        const destination = new URL(
          `${forwarded.nextUrl.pathname}${forwarded.nextUrl.search}`,
          resolveTuturuuuWebAppUrl()
        );
        const headers = new Headers(forwarded.headers);
        headers.delete('host');
        headers.set('x-forwarded-host', forwarded.nextUrl.host);
        headers.set(
          'x-forwarded-proto',
          forwarded.nextUrl.protocol.replace(':', '')
        );
        return fetch(
          new Request(
            destination,
            new Request(forwarded, { headers, redirect: 'manual' })
          )
        );
      }
      // The locale rewrite supplies server context, while Start must hydrate the
      // browser-visible URL rather than the internal Next middleware pathname.
      return start.fetch(new Request(request.url, forwarded));
    },
  });
}
