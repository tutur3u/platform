import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import appConfig from '../../start-bridge.config';
import { publicAssets } from './public-assets';

// Read the same source and exceptions as Calendar's retained Next configuration.
async function canonicalPolicy() {
  const headers = await createTuturuuuNextConfig().headers?.();
  const rule = headers?.find(({ headers }) =>
    headers.some(({ key }) => key.toLowerCase() === 'x-frame-options')
  );
  if (!rule?.source.startsWith('/:path(') || !rule.source.endsWith(')'))
    throw new Error('Unsupported canonical Calendar response policy');
  return {
    matches: new RegExp(`^/${rule.source.slice('/:path('.length, -1)}$`, 'u'),
    headers: rule.headers,
  };
}

const policy = canonicalPolicy();
const offlineDocumentPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export async function applyCalendarResponsePolicy(
  request: Request,
  response: Response,
  nonce?: string
) {
  const canonical = await policy;
  const path = new URL(request.url).pathname;
  const headers = new Headers(response.headers);
  const framingDenied = canonical.matches.test(path);
  for (const { key, value } of framingDenied ? canonical.headers : []) {
    if (key.toLowerCase() === 'content-security-policy' && headers.has(key)) {
      if (headers.get(key) !== value) headers.append(key, value);
    } else headers.set(key, value);
  }
  const isOfflineDocument =
    path === '/offline.html' &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    response.status === 200 &&
    headers.get('Content-Type')?.toLowerCase().includes('text/html');
  if (isOfflineDocument) {
    headers.append('Content-Security-Policy', offlineDocumentPolicy);
  } else if (framingDenied && nonce && appConfig.csp) {
    const csp = appConfig.csp(nonce, { request, response, path });
    if (csp != null) headers.append('Content-Security-Policy', csp);
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  const isStatic =
    (request.method === 'GET' || request.method === 'HEAD') &&
    response.ok &&
    !headers.get('Content-Type')?.toLowerCase().includes('text/html') &&
    !headers.has('Set-Cookie') &&
    (path.startsWith('/assets/') ||
      path === '/serwist/sw.js' ||
      publicAssets.has(path));
  if (!isStatic) {
    headers.set('Cache-Control', 'private, no-store');
    for (const name of [
      'CDN-Cache-Control',
      'Cloudflare-CDN-Cache-Control',
      'Vercel-CDN-Cache-Control',
    ]) {
      headers.delete(name);
    }
    const vary = new Set(
      (headers.get('Vary') ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    for (const value of ['cookie', 'authorization', 'accept-language']) {
      vary.add(value);
    }
    headers.set('Vary', [...vary].join(', '));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
