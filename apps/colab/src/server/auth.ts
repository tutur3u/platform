import { type Identity, requireRule } from '@tuturuuu/multiplayer';
import type { Env } from './env';

const encoder = new TextEncoder();
export function randomToken() {
  return (
    crypto.randomUUID().replaceAll('-', '') +
    crypto.randomUUID().replaceAll('-', '')
  );
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value))
    ),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
async function key(secret: string) {
  requireRule(secret?.length >= 32, 'auth_unavailable', 503);
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
export async function sign(identity: Identity, secret: string) {
  const payload = btoa(
    String.fromCharCode(...encoder.encode(JSON.stringify(identity)))
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))
  );
  return `${payload}.${btoa(String.fromCharCode(...signature))}`;
}
export async function verify(
  token: string | undefined,
  secret: string
): Promise<Identity | null> {
  if (!token || token.length > 6000) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
      encoder.encode(payload)
    );
    if (!valid) return null;
    const value = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      )
    ) as Identity;
    return typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      (value.email === null || typeof value.email === 'string') &&
      value.expires > Date.now()
      ? value
      : null;
  } catch {
    return null;
  }
}
export function cookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function sessionCookie(token: string, age: number) {
  return `colab_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export async function authenticate(request: Request, env: Env) {
  return verify(cookie(request, 'colab_session'), env.COLAB_SESSION_SECRET);
}
export async function authRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/verify-token') {
    const next = new URL(
      url.searchParams.get('nextUrl') ?? '/',
      env.APP_ORIGIN
    );
    requireRule(
      next.origin === env.APP_ORIGIN && next.pathname === '/auth/callback',
      'invalid_login',
      401
    );
    next.searchParams.set('token', url.searchParams.get('token') ?? '');
    return new Response(null, {
      status: 303,
      headers: {
        Location: next.toString(),
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (url.pathname === '/auth/login') {
    const nonce = randomToken();
    const returnTo = new URL('/auth/callback', env.APP_ORIGIN);
    returnTo.searchParams.set('state', nonce);
    const login = new URL('/login', env.AUTH_ORIGIN);
    login.searchParams.set('returnUrl', returnTo.toString());
    return new Response(null, {
      status: 302,
      headers: {
        Location: login.toString(),
        'Set-Cookie': `colab_login=${nonce}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        'Cache-Control': 'no-store',
      },
    });
  }
  requireRule(url.pathname === '/auth/callback', 'not_found', 404);
  const token = url.searchParams.get('token');
  const state = url.searchParams.get('state');
  requireRule(
    state &&
      state === cookie(request, 'colab_login') &&
      token &&
      token.length <= 4096,
    'invalid_login',
    401
  );
  const response = await fetch(
    new URL('/api/v1/auth/colab/verify', env.AUTH_ORIGIN),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetApp: 'colab', token }),
      signal: AbortSignal.timeout(15000),
    }
  );
  requireRule(response.ok, 'invalid_login', 401);
  const data = (await response.json()) as {
    valid?: boolean;
    userId?: string;
    email?: string;
    expiresAt?: string;
  };
  requireRule(
    data.valid && typeof data.userId === 'string',
    'invalid_login',
    401
  );
  const expires = Math.min(
    Date.parse(data.expiresAt ?? ''),
    Date.now() + 8 * 3600_000
  );
  requireRule(
    Number.isFinite(expires) && expires > Date.now(),
    'invalid_login',
    401
  );
  const email = data.email ?? null;
  const identity: Identity = {
    id: data.userId,
    email,
    name: email?.split('@')[0] ?? 'Member',
    expires,
  };
  const headers = new Headers({
    Location: '/',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  headers.append(
    'Set-Cookie',
    sessionCookie(
      await sign(identity, env.COLAB_SESSION_SECRET),
      Math.floor((expires - Date.now()) / 1000)
    )
  );
  headers.append(
    'Set-Cookie',
    'colab_login=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
  return new Response(null, { status: 303, headers });
}
