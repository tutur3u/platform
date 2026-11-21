// App-owned start-bridge Worker options for ai: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import {
  defineBridgeAppConfig,
  withDocumentSecurity,
} from '@tuturuuu/start-bridge/start/app-config';

const profile =
  import.meta.env?.VITE_AI_NATIVE_PROFILE ?? process.env.VITE_AI_NATIVE_PROFILE;

export default defineBridgeAppConfig(
  withDocumentSecurity('ai', {
    worker: { compatibilityFlags: ['enable_request_signal'] },
    mounts: {
      rootHosts: ['ai.tuturuuu.com', 'ai.tutur3u.com'],
      mountHosts: profile === 'production' ? ['tuturuuu.com'] : [],
      basePath: '/ai',
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
    wrapResponse(response, { request, mounts }) {
      const result = new Response(response.body, response);
      result.headers.set('X-Robots-Tag', 'noindex, nofollow');
      const url = new URL(request.url);
      const mount = mounts && resolveAppBase(url, { ...mounts, app: 'ai' });
      const path = url.pathname.slice(mount?.basePath.length ?? 0);
      const sandboxedWebgl =
        /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[^/]+\/webgl(?:\/|$)/u.test(
          path
        );
      if (sandboxedWebgl) {
        result.headers.delete('X-Frame-Options');
      } else {
        const csp = result.headers.get('Content-Security-Policy');
        const directives =
          csp
            ?.split(';')
            .map((directive) => directive.trim())
            .filter(
              (directive) =>
                directive.trim() &&
                !/^frame-ancestors(?:\s|$)/iu.test(directive.trim())
            ) ?? [];
        result.headers.set(
          'Content-Security-Policy',
          [...directives, "frame-ancestors 'none'"].join('; ')
        );
        result.headers.set('X-Frame-Options', 'DENY');
      }
      result.headers.set('X-Content-Type-Options', 'nosniff');
      result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      const isAsset =
        (request.method === 'GET' || request.method === 'HEAD') &&
        (path.startsWith('/assets/') || path === '/robots.txt');
      if (!isAsset) {
        result.headers.set('Cache-Control', 'private, no-store');
        const vary = result.headers.get('Vary');
        if (
          !vary
            ?.split(',')
            .some((value) => value.trim().toLowerCase() === 'cookie')
        ) {
          result.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
        }
      }
      return result;
    },
  })
);
