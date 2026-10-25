import start from '@tanstack/react-start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { proxy } from '../proxy';
import { dispatchMeetEndpoint } from './api-registry';
import { createLoginRedirectProbe } from './login-redirect-diagnostics';
import { MEET_FUNCTION_BASE } from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { dispatchThroughMeetProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { classifyMeetSsrRequest, observeMeetSsr } from './ssr-diagnostics';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

export function handleMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext
) {
  const scope = classifyMeetSsrRequest(request);
  const probe =
    scope === 'login' ? createLoginRedirectProbe(request.url) : undefined;
  return observeMeetSsr(
    'handler',
    () => dispatchMeetRequest(request, env, ctx, scope, probe),
    { scope, stage: 'proxy' },
    probe?.seal
  );
}

function dispatchMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext,
  scope: ReturnType<typeof classifyMeetSsrRequest>,
  probe?: ReturnType<typeof createLoginRedirectProbe>
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
    observeNavigation: probe?.observeNavigation,
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
      return observeMeetSsr(
        'handler',
        async () => {
          const response = await start.fetch(
            new Request(request.url, forwarded)
          );
          try {
            probe?.observeStart(response);
          } catch {
            /* Diagnostic inspection cannot replace Start's returned Response. */
          }
          return response;
        },
        { scope, stage: 'start' }
      );
    },
  });
}
