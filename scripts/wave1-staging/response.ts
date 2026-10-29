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

export function stagingResponse(response: Response): Response {
  // A 101 response carries a workerd WebSocket handle and cannot be reconstructed
  // through the standard Response constructor. Cookies are never written on it.
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  result.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
  const cookies = response.headers.getSetCookie();
  result.headers.delete('Set-Cookie');
  for (const cookie of cookies) {
    const scoped = cookie
      .replace(/;\s*Domain=[^;]*/giu, '')
      .replace(/;\s*Secure(?=;|$)/giu, '');
    const domain = /^__Host-/iu.test(scoped)
      ? ''
      : `; Domain=${stagingCookieDomain}`;
    result.headers.append('Set-Cookie', `${scoped}${domain}; Secure`);
  }
  return result;
}

export async function stagingFetch(
  request: Request,
  app: StagingApp,
  env: object,
  serve: () => Response | Promise<Response>
): Promise<Response> {
  const refused = stagingRequest(request, app);
  if (refused) return stagingResponse(refused);
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
      new Response('Staging serving disabled', { status: 503 })
    );
  }
  return stagingResponse(await serve());
}
