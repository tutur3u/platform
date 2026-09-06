import { requireRule } from '@tuturuuu/multiplayer';
import type { Env } from './env';
import { centralAuthCookies, renewedCentralCookies } from './session';

/** Only real account support endpoints are bridged; workshop tools never use this. */
const methods: Record<string, readonly string[]> = {
  '/api/v1/user/onboarding-progress': ['PATCH'],
  '/api/v1/users/me/configs/SIDEBAR_BEHAVIOR': ['GET', 'PUT'],
  '/api/reports': ['POST'],
  '/api/reports/upload-url': ['POST', 'DELETE'],
};

export async function platformProxy(request: Request, env: Env) {
  const url = new URL(request.url);
  const invite =
    /^\/api\/workspaces\/[a-f0-9-]{36}\/(?:accept|decline)-invite$/.test(
      url.pathname
    );
  const notificationMethods =
    url.pathname === '/api/v1/notifications'
      ? ['GET', 'PATCH']
      : url.pathname === '/api/v1/notifications/unread-count'
        ? ['GET']
        : /^\/api\/v1\/notifications\/[a-f0-9-]{36}(?:\/metadata)?$/.test(
              url.pathname
            )
          ? ['PATCH']
          : undefined;
  const allowed =
    methods[url.pathname] ??
    notificationMethods ??
    (invite ? ['POST'] : undefined);
  if (!allowed) return null;
  requireRule(allowed.includes(request.method), 'method_not_allowed', 405);
  requireRule(
    request.method === 'GET' ||
      request.headers.get('origin') === env.APP_ORIGIN ||
      (url.hostname === '127.0.0.1' &&
        request.headers.get('origin') === url.origin),
    'invalid_origin',
    403
  );
  let body: string | undefined;
  if (request.method !== 'GET' && !invite) {
    requireRule(
      request.headers.get('content-type')?.includes('application/json'),
      'invalid_input',
      415
    );
    const reader = request.body?.getReader();
    requireRule(reader, 'invalid_input');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32000) {
        await reader.cancel();
        requireRule(false, 'payload_too_large', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    body = new TextDecoder().decode(bytes);
  }
  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: env.APP_ORIGIN,
    'User-Agent': 'Tuturuuu-Colab/1.0',
  });
  // Forward only central auth cookies, never the Colab signing cookie or arbitrary headers.
  const cookies = centralAuthCookies(request);
  if (cookies.length) headers.set('Cookie', cookies);
  const response = await fetch(
    new URL(url.pathname + url.search, env.AUTH_ORIGIN),
    {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    }
  );
  const responseHeaders = new Headers({
    'Content-Type': response.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  for (const cookie of renewedCentralCookies(response))
    responseHeaders.append('Set-Cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
