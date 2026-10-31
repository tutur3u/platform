import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { framablePathRegexes } from '@tuturuuu/utils/framable-paths';
import type { FormsEnvironment } from './cloudflare/worker';

const PUBLIC_FILES = new Set(['/embed.js', '/robots.txt', '/sitemap.xml']);
const upstreamFramablePaths = framablePathRegexes();
const EMBED_PAGE = /^\/embed\/[^/]+(?:\/|$)/u;

export default defineBridgeAppConfig<FormsEnvironment>({
  mounts: {
    rootHosts: ['forms.tuturuuu.com', 'forms.staging.tutur3u.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  csp: defaultContentSecurityPolicy,
  wrapResponse(response, { request, env }) {
    const headers = new Headers(response.headers);
    const path = new URL(request.url).pathname;
    const isEmbed = EMBED_PAGE.test(path);
    const upstreamFramable = upstreamFramablePaths.some((pattern) =>
      pattern.test(path)
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (isEmbed) {
      headers.delete('X-Frame-Options');
      const directives = (headers.get('Content-Security-Policy') ?? '')
        .split(';')
        .map((directive) => directive.trim())
        .filter(
          (directive) =>
            directive && !/^frame-ancestors(?:\s|$)/iu.test(directive)
        );
      headers.set(
        'Content-Security-Policy',
        [...directives, 'frame-ancestors *'].join('; ')
      );
    } else if (!upstreamFramable) {
      headers.set('X-Frame-Options', 'DENY');
    }

    if (env.TUTURUUU_NOINDEX === '1' || isEmbed || upstreamFramable) {
      headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    const isStatic =
      (request.method === 'GET' || request.method === 'HEAD') &&
      response.status === 200 &&
      !headers.get('Content-Type')?.toLowerCase().includes('text/html') &&
      !headers.has('Set-Cookie') &&
      (path.startsWith('/assets/') || PUBLIC_FILES.has(path));
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
  },
});
