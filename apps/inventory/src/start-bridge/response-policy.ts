import { APP_SEO_POLICY, PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { publicAssets } from './public-assets.bridge.gen';

const policy = APP_SEO_POLICY.inventory;
const publicPaths = new Set<string>(policy.publicPaths);
const publicPatterns = policy.publicPatterns.map(
  (pattern) => new RegExp(`^(?:${pattern})$`)
);
const canonicalHost = new URL(policy.origin).host;

export function applyResponsePolicy(request: Request, response: Response) {
  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/(?:en|vi)(?=\/|$)/u, '')
    .replace(/^\//u, '')
    .replace(/\/$/u, '');
  const isPublic =
    url.host === canonicalHost &&
    (publicPaths.has(path) ||
      publicPatterns.some((pattern) => pattern.test(path)));
  const result = new Response(response.body, response);
  result.headers.set(
    'X-Robots-Tag',
    isPublic ? 'index, follow' : PRIVATE_ROBOTS_HEADER
  );
  const directives = (result.headers.get('Content-Security-Policy') ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value && !/^frame-ancestors(?:\s|$)/iu.test(value));
  directives.push("frame-ancestors 'none'");
  result.headers.set('Content-Security-Policy', directives.join('; '));
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  const isAsset =
    (request.method === 'GET' || request.method === 'HEAD') &&
    (url.pathname.startsWith('/assets/') || publicAssets.has(url.pathname));
  if (!isAsset) {
    result.headers.set('Cache-Control', 'private, no-store');
    const vary =
      result.headers
        .get('Vary')
        ?.split(',')
        .map((value) => value.trim().toLowerCase()) ?? [];
    if (!vary.includes('cookie')) result.headers.append('Vary', 'Cookie');
  }
  return result;
}
