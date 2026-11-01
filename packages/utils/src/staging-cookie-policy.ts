import { isStagingAppHostname } from '@tuturuuu/utils/staging-hosts';

/** Final response fence: staging cookies must never acquire a Domain attribute. */
export function enforceStagingCookiePolicy(
  request: Request,
  response: Response
): Response {
  if (!isStagingAppHostname(new URL(request.url).hostname)) return response;
  if (
    !response.headers
      .getSetCookie()
      .some((cookie) => /;\s*domain\s*=/iu.test(cookie))
  )
    return response;
  void response.body?.cancel().catch(() => {});
  const headers = new Headers(response.headers);
  for (const name of [
    'set-cookie',
    'content-length',
    'content-encoding',
    'content-type',
    'location',
    'etag',
  ])
    headers.delete(name);
  headers.set('cache-control', 'no-store');
  return new Response('Staging cookie domain rejected', {
    status: 500,
    headers,
  });
}
