import {
  defineBridgeAppConfig,
  withDocumentSecurity,
} from '@tuturuuu/start-bridge/start/app-config';
import { framablePathRegexes } from '@tuturuuu/utils/framable-paths';
import type { CmsEnvironment } from './cloudflare/worker';

const PUBLIC_FILES = new Set(['/robots.txt']);
const framablePaths = framablePathRegexes();

export default defineBridgeAppConfig<CmsEnvironment>(
  withDocumentSecurity<CmsEnvironment>('cms', {
    mounts: {
      rootHosts: ['cms.tuturuuu.com', 'cms.tutur3u.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/cms',
      isolation: {
        ownedCookies: [
          'NEXT_LOCALE',
          'sidebar-collapsed',
          'sidebar-behavior',
          'sidebar-behavior-updated-at',
        ],
      },
      unknownHost: 'reject',
    },
    wrapResponse(response, { request }) {
      const headers = new Headers(response.headers);
      const url = new URL(request.url);
      const path =
        url.hostname === 'tuturuuu.com' &&
        (url.pathname === '/cms' || url.pathname.startsWith('/cms/'))
          ? url.pathname.slice('/cms'.length) || '/'
          : url.pathname;
      headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      if (framablePaths.some((pattern) => pattern.test(path))) {
        headers.delete('X-Frame-Options');
      } else {
        headers.set('X-Frame-Options', 'DENY');
        const policies = (headers.get('Content-Security-Policy') ?? '')
          .split(',')
          .map((policy) => {
            const directives = policy
              .split(';')
              .map((directive) => directive.trim())
              .filter(
                (directive) =>
                  directive && !/^frame-ancestors(?:\s|$)/iu.test(directive)
              );
            return [...directives, "frame-ancestors 'none'"].join('; ');
          });
        headers.set('Content-Security-Policy', policies.join(', '));
      }
      const isStatic =
        (request.method === 'GET' || request.method === 'HEAD') &&
        (path.startsWith('/assets/') || PUBLIC_FILES.has(path)) &&
        response.status === 200 &&
        !headers.get('Content-Type')?.toLowerCase().includes('text/html') &&
        !headers.has('Set-Cookie');
      if (!isStatic) {
        headers.set('Cache-Control', 'private, no-store');
        for (const name of [
          'CDN-Cache-Control',
          'Cloudflare-CDN-Cache-Control',
          'Vercel-CDN-Cache-Control',
        ]) {
          headers.delete(name);
        }
        headers.append('Vary', 'Cookie, Authorization, Accept-Language');
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  })
);
