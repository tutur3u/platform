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
export function isNativeStaticAsset(request: Request, origin: string) {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === origin &&
    request.mode !== 'navigate' &&
    ['font', 'image', 'script', 'style', 'worker'].includes(
      request.destination
    ) &&
    /^\/assets\/[^?]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/u.test(
      url.pathname
    )
  );
}
