import {
  productionSupabaseProjectRefs,
  type StagingApp,
  stagingCookieDomain,
  stagingHost,
} from './profiles.ts';

export function stagingRequest(
  request: Request,
  app: StagingApp
): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || url.host !== stagingHost(app)) {
    return new Response('Staging host refused', { status: 421 });
  }
  return null;
}

/**
 * The only cookies production shares across subdomains: Supabase auth tokens
 * (with their chunks and PKCE verifier) and the app-session pair. Every other
 * cookie is app-private and must stay host-only.
 */
const sharedAuthCookieName =
  /^(?:sb-[A-Za-z0-9-]+-auth-token(?:-code-verifier)?(?:\.\d+)?|tuturuuu_(?:web_)?app_session(?:_refresh)?)$/u;

export function isSharedAuthCookieName(name: string) {
  return sharedAuthCookieName.test(name);
}

/** The shared staging cookie domain, only when `host` is inside it. */
export function stagingCookieScope(host: string) {
  const zone = stagingCookieDomain.slice(1);
  const hostname = host.toLowerCase();
  return hostname === zone || hostname.endsWith(`.${zone}`)
    ? stagingCookieDomain
    : null;
}

/**
 * Rewrites one Set-Cookie value for a hosted staging response: drops any
 * Domain, forces Secure, and restores the shared staging Domain only for a
 * shared auth cookie on a host inside that domain. `__Host-` cookies and all
 * app-private cookies stay host-only.
 */
export function scopeStagingCookie(cookie: string, host: string) {
  const name = cookie.slice(0, Math.max(cookie.indexOf('='), 0)).trim();
  const scoped = cookie
    .replace(/;\s*Domain\s*=[^;]*/giu, '')
    .replace(/;\s*Secure\s*(?=;|$)/giu, '');
  const domain =
    !/^__Host-/iu.test(name) && isSharedAuthCookieName(name)
      ? stagingCookieScope(host)
      : null;
  return `${scoped}${domain ? `; Domain=${domain}` : ''}; Secure`;
}

export function stagingResponse(response: Response, host: string): Response {
  // A 101 response carries a workerd WebSocket handle and cannot be reconstructed
  // through the standard Response constructor. Cookies are never written on it.
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  result.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
  const cookies = response.headers.getSetCookie();
  result.headers.delete('Set-Cookie');
  for (const cookie of cookies)
    result.headers.append('Set-Cookie', scopeStagingCookie(cookie, host));
  return result;
}

export async function stagingFetch(
  request: Request,
  app: StagingApp,
  env: object,
  serve: () => Response | Promise<Response>
): Promise<Response> {
  const host = stagingHost(app);
  const refused = stagingRequest(request, app);
  if (refused) return stagingResponse(refused, host);
  const ref =
    'WAVE1_STAGING_SUPABASE_PROJECT_REF' in env
      ? env.WAVE1_STAGING_SUPABASE_PROJECT_REF
      : null;
  const url =
    'NEXT_PUBLIC_SUPABASE_URL' in env ? env.NEXT_PUBLIC_SUPABASE_URL : null;
  const enabled =
    'WAVE1_STAGING_SERVING_ENABLED' in env &&
    env.WAVE1_STAGING_SERVING_ENABLED === '1';
  if (
    !enabled ||
    typeof ref !== 'string' ||
    !/^[a-z0-9]{20}$/u.test(ref) ||
    productionSupabaseProjectRefs.includes(ref) ||
    url !== `https://${ref}.supabase.co`
  ) {
    return stagingResponse(
      new Response('Staging serving disabled', { status: 503 }),
      host
    );
  }
  return stagingResponse(await serve(), host);
}
