import { createBasePath } from '@tuturuuu/start-bridge/base-path';
export const OFFLINE_WORKER_URL = '/serwist/sw.js';
export const OFFLINE_SCOPE = '/';
export const offlinePrecache = [
  '/offline.html',
  '/offline.css',
  '/offline.js',
  '/site.webmanifest',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
];
export function calendarOfflineContract(basePath = '') {
  const base = createBasePath({ app: 'calendar', basePath });
  return {
    workerUrl: base.withBase(OFFLINE_WORKER_URL),
    scope: base.withBase(OFFLINE_SCOPE),
    precache: offlinePrecache.map((path) => base.withBase(path)),
    fallback: base.withBase('/offline.html'),
  };
}
export function isNativeStaticAsset(
  request: Request,
  origin: string,
  basePath = ''
) {
  const url = new URL(request.url);
  const pathname = createBasePath({ app: 'calendar', basePath }).strip(
    url.pathname
  );
  return (
    request.method === 'GET' &&
    url.origin === origin &&
    request.mode !== 'navigate' &&
    ['font', 'image', 'script', 'style', 'worker'].includes(
      request.destination
    ) &&
    /^\/assets\/[^?]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/u.test(
      pathname ?? ''
    )
  );
}
