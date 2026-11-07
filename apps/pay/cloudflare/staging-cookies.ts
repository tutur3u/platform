import { isStagingAppHostname } from '@tuturuuu/utils/staging-hosts';

export function stagingCookieRequest(request: Request): Request {
  if (!isStagingAppHostname(new URL(request.url).hostname)) return request;
  const headers = new Headers(request.headers);
  const cookies = (headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim());
  headers.set(
    'cookie',
    cookies
      .filter((part) => part.startsWith('__Host-'))
      .map((part) => part.slice(7))
      .join('; ')
  );
  return new Request(request, { headers });
}

export function stagingCookieResponse(
  request: Request,
  response: Response
): Response {
  if (!isStagingAppHostname(new URL(request.url).hostname)) return response;
  const cookies = response.headers.getSetCookie();
  if (!cookies.length) return response;
  const result = new Response(response.body, response);
  result.headers.delete('set-cookie');
  for (const cookie of cookies) {
    const parts = cookie.split(';');
    const nameValue = parts.shift()?.trim() ?? '';
    const attributes = parts.filter(
      (part) => !/^\s*(path|secure)\s*(=|$)/iu.test(part)
    );
    result.headers.append(
      'set-cookie',
      `${nameValue.startsWith('__Host-') ? nameValue : `__Host-${nameValue}`}; Path=/; Secure${attributes.map((part) => `;${part}`).join('')}`
    );
  }
  return result;
}
