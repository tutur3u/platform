// App-owned start-bridge Worker options for marketing: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
  type ResponsePolicyContext,
} from '@tuturuuu/start-bridge/response-policy';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo-robots';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

// Vite replaces this real Node-readable fallback with the emitted CSS mapping.
import styles from './src/lib/landing-style-map.json' with { type: 'json' };
/** Keep serialized RSC resource identities consistent with the document head. */
export function landingStyles(
  html: string,
  mapping: Record<string, { critical: string; remaining: string }>
) {
  let result = html;
  for (const [full, { critical, remaining }] of Object.entries(mapping)) {
    result = result.replaceAll(full, critical);
    const mount = html.includes(`/marketing${full}`) ? '/marketing' : '';
    result = result.replace(
      '</head>',
      `<link rel="stylesheet" media="print" fetchpriority="low" data-landing-complete="" data-href="${mount}${remaining}"><noscript><link rel="stylesheet" href="${mount}${full}"></noscript></head>`
    );
  }
  // Module dependencies load from the normal entry after critical visual assets.
  // The server-rendered links and poster work before hydration.
  return result
    .replace(/<link\b[^>]*rel="modulepreload"[^>]*\/?>(?:<\/link>)?/gu, '')
    .replace(
      /<script\b([^>]*type="module"[^>]*)>/gu,
      '<script fetchpriority="low"$1>'
    );
}

const secure = createRootResponsePolicy({
  seo: (context) =>
    new URL(context.request.url).hostname === 'tuturuuu.com'
      ? appRobots(context)
      : PRIVATE_ROBOTS_HEADER,
});

/** Mark only restrictions introduced for the backend origin, never upstream policy. */
function finalize(response: Response, context: ResponsePolicyContext) {
  const upstreamRobots = response.headers.get('x-robots-tag');
  const secured = secure(response, context);
  if (secured.status === 101) return secured;
  // The shared policy preserves noindex; none is its equally restrictive alias.
  if (upstreamRobots && /\bnone\b/iu.test(upstreamRobots)) {
    secured.headers.set('x-robots-tag', upstreamRobots);
  }
  secured.headers.delete('x-marketing-origin-robots');
  if (
    new URL(context.request.url).origin !== 'https://tuturuuu.com' &&
    (context.env as { TUTURUUU_NOINDEX?: string } | undefined)
      ?.TUTURUUU_NOINDEX !== '1' &&
    upstreamRobots === null &&
    secured.headers.get('x-robots-tag') === PRIVATE_ROBOTS_HEADER
  ) {
    secured.headers.set('x-marketing-origin-robots', '1');
  }
  return secured;
}

export default defineBridgeAppConfig({
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse: (response, context) => {
    const path =
      new URL(context.request.url).pathname.replace(
        /^\/marketing(?=\/|$)/u,
        ''
      ) || '/';
    if (
      response.status === 200 &&
      context.request.method === 'GET' &&
      ['/', '/en', '/vi'].includes(path) &&
      response.headers.get('content-type')?.includes('text/html') &&
      Object.keys(styles).length
    ) {
      return response.text().then((html) => {
        const styled = new Response(landingStyles(html, styles), response);
        styled.headers.delete('content-length');
        return finalize(styled, context);
      });
    }
    return finalize(response, context);
  },
});
