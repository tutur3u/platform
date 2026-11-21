import type { AppMountConfig } from '@tuturuuu/start-bridge/mounts';
import { calendarMounts } from './calendar-mount';
import { isCalendarStagingArtifact } from './deployment-profile';
import { calendarOneOriginMode } from './one-origin';

/** Monitoring keeps reading the subdomain's build identity directly. */
const LEGACY_HOST_SERVED_PATHS = new Set(['/api/build-info']);
const LEGACY_SERVICE_WORKER_PATH = '/serwist/sw.js';

/**
 * Replaces a service worker that browsers installed from the subdomain: it
 * clears that origin's caches, unregisters itself and reloads open tabs, so
 * they reach the apex mount through the subdomain's redirect.
 */
export const LEGACY_SERVICE_WORKER_SOURCE = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: 'window' });
      await Promise.all(tabs.map((tab) => tab.navigate(tab.url)));
    })()
  );
});
`;

function isLegacyHost(url: URL, mounts: AppMountConfig) {
  const host = url.host.toLowerCase();
  return mounts.rootHosts.some((root) => root.toLowerCase() === host);
}

function mountPath(pathname: string, basePath: string) {
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  return pathname === '/' ? basePath : `${basePath}${pathname}`;
}

/**
 * When `TTR_ONE_ORIGIN_CALENDAR=on`, the subdomain moves visitors to
 * `https://<mount host><base><path>?<query>` (301 for GET/HEAD; 307 preserves
 * other methods) before any auth, locale or app handling. Its build identity
 * stays served, and its service-worker path answers with a worker that
 * removes itself. `off` and `shadow` serve the subdomain unchanged, including
 * the registered OAuth callbacks. Staging never redirects.
 */
export function legacyHostResponse(
  request: Request,
  env?: object,
  mounts: AppMountConfig = calendarMounts
): Response | null {
  if (isCalendarStagingArtifact()) return null;
  if (calendarOneOriginMode(env) !== 'on') return null;
  const url = new URL(request.url);
  const mountHost = mounts.mountHosts?.[0];
  const basePath = mounts.basePath;
  if (!mountHost || !basePath || !isLegacyHost(url, mounts)) return null;
  if (LEGACY_HOST_SERVED_PATHS.has(url.pathname)) return null;
  if (url.pathname === LEGACY_SERVICE_WORKER_PATH) {
    return new Response(LEGACY_SERVICE_WORKER_SOURCE, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
      },
    });
  }
  const target = new URL(
    mountPath(url.pathname, basePath),
    `https://${mountHost}`
  );
  target.search = url.search;
  return new Response(null, {
    status: request.method === 'GET' || request.method === 'HEAD' ? 301 : 307,
    headers: { Location: target.href },
  });
}
