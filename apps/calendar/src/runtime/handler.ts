import { retarget } from '@tuturuuu/start-bridge/base-path';
import { APP_BASE_HEADER } from '@tuturuuu/start-bridge/mounts';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { proxy } from '../proxy';
import { beforeLocalApiOwner, forwardToOwner } from './api-owner-routing';
import { dispatchCalendarEndpoint } from './api-registry.server';
import { calendarBase } from './calendar-mount';
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
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';

const start = createBridgeStartHandler();

export async function handleCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  try {
    return await applyCalendarResponsePolicy(
      request,
      await dispatchCalendarRequest(request, env, ctx, telemetry)
    );
  } catch (error) {
    reportCalendarSsrError(error, 'handler');
    throw error;
  }
}

async function dispatchCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  const url = new URL(request.url);
  const base = calendarBase(url);
  let path = base?.strip(url.pathname);
  if (!base || path == null) return new Response('Not Found', { status: 404 });
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
    await withBridgeRequest({ request, appBase: base.basePath }, async () =>
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
                : resolveInternalAppUrl({
                    appName: 'tasks',
                    candidates: [
                      process.env.TASKS_APP_URL,
                      process.env.NEXT_PUBLIC_TASKS_APP_URL,
                    ],
                    fallback:
                      process.env.NODE_ENV === 'production'
                        ? 'https://tasks.tuturuuu.com'
                        : getLocalInternalAppUrl(
                            'tasks',
                            'http://localhost:7809'
                          ),
                  });
            return fetch(
              forwardToOwner(base.stripRequest(forwarded) ?? forwarded, origin)
            );
          }
          const endpoint = await dispatchCalendarEndpoint(forwarded);
          if (endpoint) return endpoint;
          if (forwarded.nextUrl.pathname.startsWith('/api/')) {
            if (!base.isRoot) return new Response('Not Found', { status: 404 });
            return fetch(forwardToOwner(forwarded, resolveTuturuuuWebAppUrl()));
          }
          if (
            forwarded.nextUrl.pathname === CALENDAR_FUNCTION_BASE ||
            forwarded.nextUrl.pathname.startsWith(`${CALENDAR_FUNCTION_BASE}/`)
          )
            return start.fetch(base.stripRequest(forwarded) ?? forwarded);
          return start.fetch(new Request(request.url, requestInit(forwarded)));
        },
      })
    )
  );
}
