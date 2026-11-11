import {
  retarget,
  trimTrailingSlashes,
} from '@tuturuuu/start-bridge/base-path';
import {
  decideOneOriginRequest,
  parseOneOriginMode,
} from '@tuturuuu/utils/one-origin-routing';
import { calendarMounts } from './calendar-mount';
import {
  CALENDAR_FUNCTION_BASE,
  CALENDAR_LEGACY_FUNCTION_BASE,
} from './native-function-config';
import type { CalendarWorkerEnvironment } from './worker-contract';

const machinePrefixes = [
  '/api',
  '/assets',
  '/.well-known',
  '/_serverFn',
  CALENDAR_FUNCTION_BASE,
  CALENDAR_LEGACY_FUNCTION_BASE,
  '/serwist',
];
const inPath = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function decideCalendarOneOrigin(
  request: Request,
  env: CalendarWorkerEnvironment
) {
  const mountHost = calendarMounts.mountHosts?.[0];
  const rootHost = calendarMounts.rootHosts[0];
  // Staging and development have no apex mount and retain their host policy.
  if (!mountHost || !rootHost) return null;
  const url = new URL(request.url);
  const insecureMount = url.host === mountHost && url.protocol !== 'https:';
  return decideOneOriginRequest(request, {
    basePath: calendarMounts.basePath,
    basePathReady: true,
    sharedOrigin: insecureMount ? url.origin : `https://${mountHost}`,
    subdomainOrigin: `https://${rootHost}`,
    mode: insecureMount
      ? 'off'
      : parseOneOriginMode(env.TTR_ONE_ORIGIN_CALENDAR),
    redirectStatus: 307,
    machinePathPrefixes: machinePrefixes,
  });
}

/** Mounted document redirects run only during canonical mode, before proxy/SSR. */
export function calendarNavigationRedirect(
  request: Request,
  env: CalendarWorkerEnvironment
): Response | null {
  if (parseOneOriginMode(env.TTR_ONE_ORIGIN_CALENDAR) !== 'on') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (request.headers.has('upgrade')) return null;
  const mode = request.headers.get('sec-fetch-mode');
  if (
    mode
      ? mode !== 'navigate'
      : !request.headers.get('accept')?.includes('text/html')
  )
    return null;
  const url = new URL(request.url);
  const base = calendarMounts.basePath;
  if (
    !calendarMounts.mountHosts?.includes(url.host) ||
    !inPath(url.pathname, base)
  )
    return null;
  const path = url.pathname.slice(base.length) || '/';
  if (machinePrefixes.some((prefix) => inPath(path, prefix))) return null;
  // Meet Together belongs to Web, outside Calendar's response base rewriting.
  const target = inPath(path, '/meet-together')
    ? trimTrailingSlashes(path)
    : url.pathname.endsWith('/')
      ? trimTrailingSlashes(url.pathname)
      : null;
  return target === null
    ? null
    : new Response(null, {
        status: 301,
        headers: { Location: `${url.origin}${target}${url.search}` },
      });
}

/** The pinned router's base root needs a slash internally, without a public hop. */
export function prepareCalendarStartRequest(
  request: Request,
  base: string
): Request {
  const url = new URL(request.url);
  if (
    !base ||
    url.pathname !== base ||
    (request.method !== 'GET' && request.method !== 'HEAD')
  )
    return request;
  url.pathname = `${base}/`;
  return retarget(request, url);
}
