import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import {
  defaultContentSecurityPolicy,
  createNonce,
} from '@tuturuuu/start-bridge/csp';
import {
  admitMountedMutation,
  isMountedLogoutPath,
  prefixHtmlAssets,
  refuseCrossOriginMountedLogout,
  refuseMountedSessionMinting,
  stripMountedSessionWrites,
} from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import {
  isLegacyMeetAiApi,
  LEGACY_MEET_AI_API_BODY,
  LEGACY_MEET_AI_API_HEADERS,
} from '../lib/legacy-meet-ai-api';
import { proxy } from '../proxy';
import { meetRequestBase } from './app-base';
import { mountedMeetCookieHeader } from './mounted-cookies';
import { dispatchMeetEndpoint } from './api-registry';
import { createLoginRedirectProbe } from './login-redirect-diagnostics';
import { MEET_FUNCTION_BASE } from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { dispatchThroughMeetProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { classifyMeetSsrRequest, observeMeetSsr } from './ssr-diagnostics';
import { withMeetServerTiming } from './ssr-timing';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

const start = createBridgeStartHandler();

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

async function dispatchMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext,
  scope: ReturnType<typeof classifyMeetSsrRequest>,
  probe?: ReturnType<typeof createLoginRedirectProbe>
) {
  const url = new URL(request.url);
  const base = meetRequestBase(url);
  const path = base.strip(url.pathname);
  if (path === null) return new Response('Not Found', { status: 404 });
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') || publicAssets.has(path))
  ) {
    if (!env.ASSETS) throw new Error('Meet assets binding is unavailable');
    return env.ASSETS.fetch(base.stripRequest(request) ?? request);
  }
  const logout = !base.isRoot && isMountedLogoutPath(path);
  const nonce = base.isRoot ? undefined : createNonce();
  if (!base.isRoot) {
    const forbidden =
      refuseMountedSessionMinting(path) ??
      (logout ? refuseCrossOriginMountedLogout(request) : null) ??
      admitMountedMutation({ appPath: path, mode: 'enforce', request });
    if (forbidden) return forbidden;
    const headers = new Headers(request.headers);
    const cookies = headers.get('cookie');
    if (cookies) {
      headers.set('cookie', mountedMeetCookieHeader(cookies));
    }
    request = new Request(request, { headers });
  }
  const response = await dispatchThroughMeetProxy({
    basePath: base.basePath,
    nonce,
    request,
    observeLoginNavigation: probe?.observeNavigation,
    proxy: isFunction(path) ? nativeFunctionProxy : proxy,
    waitUntil: (work) => ctx.waitUntil(work),
    cloudflare: { env, ctx },
    dispatch: async (forwarded) => {
      const endpoint = logout ? null : await dispatchMeetEndpoint(forwarded);
      if (endpoint) return endpoint;
      if (forwarded.nextUrl.pathname.startsWith('/api/')) {
        // Defense in depth behind proxy(): legacy web Meet AI is never forwarded.
        if (isLegacyMeetAiApi(forwarded.nextUrl.pathname))
          return Response.json(LEGACY_MEET_AI_API_BODY, {
            status: 403,
            headers: LEGACY_MEET_AI_API_HEADERS,
          });
        const webOrigin = resolveTuturuuuWebAppUrl();
        if (!base.isRoot) {
          const centralRequest = base.stripRequest(forwarded);
          if (!centralRequest)
            return new Response('Not Found', { status: 404 });
          return forwardToCentralApi(centralRequest, webOrigin, {
            ownsPath: base.owns,
          });
        }
        const destination = new URL(
          `${forwarded.nextUrl.pathname}${forwarded.nextUrl.search}`,
          webOrigin
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
          const startedAt = performance.now();
          const startRequest = isFunction(path)
            ? (base.stripRequest(forwarded) ?? forwarded)
            : new Request(request.url, forwarded);
          const response = await start.fetch(startRequest);
          try {
            probe?.observeStart(response);
          } catch {
            /* Diagnostic inspection cannot replace Start's returned Response. */
          }
          return withMeetServerTiming(
            prefixHtmlAssets(response, url, base.basePath, publicAssets),
            performance.now() - startedAt
          );
        },
        { scope, stage: 'start' }
      );
    },
  });
  const finalized = base.finalizeResponse(response);
  if (base.isRoot) return finalized;
  const mounted = stripMountedSessionWrites(finalized);
  if (
    !nonce ||
    !mounted.headers.get('content-type')?.startsWith('text/html') ||
    mounted.headers.has('content-security-policy')
  )
    return mounted;
  const secured = new Response(mounted.body, mounted);
  secured.headers.set(
    'content-security-policy',
    defaultContentSecurityPolicy(nonce)
  );
  return secured;
}

function isFunction(path: string) {
  return (
    path === MEET_FUNCTION_BASE || path.startsWith(`${MEET_FUNCTION_BASE}/`)
  );
}
