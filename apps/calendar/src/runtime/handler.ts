import start from '@tanstack/react-start/server-entry';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { proxy } from '../proxy';
import { beforeLocalApiOwner, forwardToOwner } from './api-owner-routing';
import { dispatchCalendarEndpoint } from './api-registry.server';
import { CALENDAR_FUNCTION_BASE } from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { dispatchThroughCalendarProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { requestInit } from './request-init';
import {
  type CalendarTelemetryPort,
  createCalendarTelemetryPort,
} from './request-telemetry.server';
import { applyCalendarResponsePolicy } from './response-policy';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';

export async function handleCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  return applyCalendarResponsePolicy(
    request,
    await dispatchCalendarRequest(request, env, ctx, telemetry)
  );
}

async function dispatchCalendarRequest(
  request: Request,
  env: CalendarWorkerEnvironment,
  ctx: CalendarExecutionContext,
  telemetry?: CalendarTelemetryPort
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') ||
      path === '/serwist/sw.js' ||
      publicAssets.has(path))
  ) {
    return env.ASSETS.fetch(request).then((response) => {
      if (path !== '/serwist/sw.js') return response;
      const headers = new Headers(response.headers);
      headers.set('Service-Worker-Allowed', '/');
      headers.set('Cache-Control', 'no-cache');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  }
  return dispatchThroughCalendarProxy({
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
                    : getLocalInternalAppUrl('tasks', 'http://localhost:7809'),
              });
        return fetch(forwardToOwner(forwarded, origin));
      }
      const endpoint = await dispatchCalendarEndpoint(forwarded);
      if (endpoint) return endpoint;
      if (forwarded.nextUrl.pathname.startsWith('/api/'))
        return fetch(forwardToOwner(forwarded, resolveTuturuuuWebAppUrl()));
      return start.fetch(new Request(request.url, requestInit(forwarded)));
    },
  });
}
