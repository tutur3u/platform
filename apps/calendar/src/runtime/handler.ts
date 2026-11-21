import { retarget } from '@tuturuuu/start-bridge/base-path';
import { createNonce } from '@tuturuuu/start-bridge/csp';
import { APP_BASE_HEADER } from '@tuturuuu/start-bridge/mounts';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { matchRoute } from '@tuturuuu/start-bridge/route-match';
import {
  admitMountedMutation,
  isolateMountedRequest,
  refuseMountedSessionMinting,
  scopeMountedResponseCookies,
} from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { isCalendarApexMountUrl } from '../lib/calendar-mount-hosts';
import { proxy } from '../proxy';
import { beforeLocalApiOwner, forwardToOwner } from './api-owner-routing';
import { dispatchCalendarEndpoint } from './api-registry.server';
import { registerCalendarServerApiPaths } from './calendar-api-server';
import { calendarBase, calendarMounts } from './calendar-mount';
import { isCalendarStagingArtifact } from './deployment-profile';
import { legacyHostResponse } from './legacy-host';
import { calendarOneOriginMode } from './one-origin';
import {
  CALENDAR_FUNCTION_BASE,
  CALENDAR_LEGACY_FUNCTION_BASE,
} from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { dispatchThroughCalendarProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { requestInit } from './request-init';
import {
  type CalendarTelemetryPort,
  createCalendarTelemetryPort,
} from './request-telemetry.server';
import { applyCalendarResponsePolicy } from './response-policy';
import { reportCalendarSsrError } from './ssr-diagnostics';
import { denyWithoutStagingAccess, fetchOwner } from './staging-access';
import { resolveCalendarTasksOrigin } from './tasks-origin';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';

registerCalendarServerApiPaths();
const start = createBridgeStartHandler();
const mountedCookies = {
  ownedCookies: [
    'NEXT_LOCALE',
    'calendar-plan-panel',
    'sidebar-behavior',
    'sidebar-behavior-updated-at',
    'sidebar-collapsed',
    'sidebar-size',
  ],
};
const providerHandoffs = [
  '/api/v1/calendar/auth',
  '/api/v1/calendar/auth/callback',
  '/api/v1/calendar/auth/microsoft',
  '/api/v1/calendar/auth/microsoft/callback',
];

export async function handleCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  const nonce = createNonce();
  try {
    const response = await applyCalendarResponsePolicy(
      request,
      await dispatchCalendarRequest(request, env, ctx, nonce, telemetry),
      nonce
    );
    const base = calendarBase(new URL(request.url));
    return base && !base.isRoot
      ? scopeMountedResponseCookies(response, base.basePath, mountedCookies)
      : response;
  } catch (error) {
    reportCalendarSsrError(error, 'handler');
    throw error;
  }
}

async function dispatchCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  nonce: string,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  const legacy = legacyHostResponse(request, env);
  if (legacy) return legacy;
  const url = new URL(request.url);
  // The apex mount is admitted only in shadow (this release) and on (later).
  // Off refuses it, matching Mail, so an unset variable cannot publish /calendar.
  if (
    !isCalendarStagingArtifact() &&
    calendarOneOriginMode(env) === 'off' &&
    isCalendarApexMountUrl(url, '/calendar')
  ) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const base = calendarBase(url);
  const appPath = base?.strip(url.pathname);
  if (!base || appPath == null)
    return new Response('Not Found', { status: 404 });
  let path = appPath;
  const denied = await denyWithoutStagingAccess(request, env);
  if (denied) return denied;
  if (!base.isRoot) {
    if (
      refuseMountedSessionMinting(path) ||
      matchRoute('/api/auth/logout', path)
    )
      return Response.json(
        { error: 'The shared session is managed by Web' },
        { status: 409 }
      );
    if (providerHandoffs.some((pattern) => matchRoute(pattern, appPath))) {
      const host = calendarMounts.rootHosts[0];
      // Start the document flow on the registered callback host so its
      // HttpOnly PKCE state stays there throughout the Microsoft handoff.
      if (
        host &&
        request.method === 'GET' &&
        (appPath === '/api/v1/calendar/auth' ||
          appPath === '/api/v1/calendar/auth/microsoft') &&
        url.searchParams.get('navigation') === '1'
      ) {
        const target = new URL(appPath, `https://${host}`);
        for (const name of ['wsId', 'reconnect', 'navigation']) {
          const value = url.searchParams.get(name);
          if (value !== null) target.searchParams.set(name, value);
        }
        return new Response(null, {
          status: 307,
          headers: { Location: target.href, 'Cache-Control': 'no-store' },
        });
      }
      return Response.json(
        { error: 'Calendar provider sign-in uses calendar.tuturuuu.com' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const rejected = admitMountedMutation({
      appPath: path,
      mode: 'enforce',
      request,
    });
    if (rejected) return rejected;
    request = isolateMountedRequest(request, mountedCookies);
  }
  if (
    path === CALENDAR_LEGACY_FUNCTION_BASE ||
    path.startsWith(`${CALENDAR_LEGACY_FUNCTION_BASE}/`)
  ) {
    path = `${CALENDAR_FUNCTION_BASE}${path.slice(CALENDAR_LEGACY_FUNCTION_BASE.length)}`;
    url.pathname = base.withBase(path);
    request = retarget(request, url);
  }
  const headers = new Headers(request.headers);
  headers.delete(APP_BASE_HEADER);
  if (!base.isRoot) headers.set(APP_BASE_HEADER, base.basePath);
  if (!base.isRoot || request.headers.has(APP_BASE_HEADER))
    request = new Request(request, { headers });
  if (path === '/api/build-info') {
    const identity = workerBuildInfo(
      base.stripRequest(request) ?? request,
      'calendar'
    );
    if (identity) return identity;
  }
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') ||
      path === '/serwist/sw.js' ||
      publicAssets.has(path))
  ) {
    return env.ASSETS.fetch(base.stripRequest(request) ?? request).then(
      (response) => {
        if (path !== '/serwist/sw.js') return response;
        const headers = new Headers(response.headers);
        headers.set(
          'Service-Worker-Allowed',
          base.isRoot ? '/' : `${base.basePath}/`
        );
        headers.set('Cache-Control', 'no-cache');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    );
  }
  return base.finalizeResponse(
    await withBridgeRequest(
      { request, appBase: base.basePath, nonce },
      async () =>
        dispatchThroughCalendarProxy({
          request,
          proxy:
            path === CALENDAR_FUNCTION_BASE ||
            path.startsWith(`${CALENDAR_FUNCTION_BASE}/`)
              ? nativeFunctionProxy
              : proxy,
          waitUntil: (work) => ctx.waitUntil(work),
          cloudflare: { env, ctx },
          telemetry:
            telemetry ??
            (await createCalendarTelemetryPort((work) => ctx.waitUntil(work))),
          dispatch: async (forwarded) => {
            const owner = beforeLocalApiOwner(forwarded.nextUrl.pathname);
            if (owner) {
              const origin =
                owner === 'web'
                  ? resolveTuturuuuWebAppUrl()
                  : resolveCalendarTasksOrigin();
              if (!origin)
                return Response.json(
                  { error: 'Tasks is not configured for this deployment' },
                  { status: 503, headers: { 'cache-control': 'no-store' } }
                );
              return fetchOwner(
                forwardToOwner(
                  base.stripRequest(forwarded) ?? forwarded,
                  origin
                ),
                env
              );
            }
            const endpoint = await dispatchCalendarEndpoint(forwarded);
            if (endpoint) return endpoint;
            if (forwarded.nextUrl.pathname.startsWith('/api/')) {
              if (!base.isRoot)
                return new Response('Not Found', { status: 404 });
              return fetchOwner(
                forwardToOwner(forwarded, resolveTuturuuuWebAppUrl()),
                env
              );
            }
            if (
              forwarded.nextUrl.pathname === CALENDAR_FUNCTION_BASE ||
              forwarded.nextUrl.pathname.startsWith(
                `${CALENDAR_FUNCTION_BASE}/`
              )
            )
              return start.fetch(base.stripRequest(forwarded) ?? forwarded);
            return start.fetch(
              new Request(request.url, requestInit(forwarded))
            );
          },
        })
    )
  );
}
