import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const LOGIN_COOKIE = '__Host-passwords_login';
export const LOGIN_TTL_SECONDS = 600;
export type LoginAttempt = {
  nonce: string;
  next: string;
  subject: string | null;
  expires: number;
  stepUp: boolean;
};

export function configuredOrigin(value: string, allowLoopback = false) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (loopback && !allowLoopback) ||
    (url.protocol !== 'https:' &&
      !(allowLoopback && loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid authentication configuration');
  return url.origin;
}

export function cookie(request: Request, name: string) {
  const values = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  // Ambiguous Domain/Path cookies cannot select the browser's identity.
  if (values.length !== 1) return null;
  try {
    return decodeURIComponent(values[0]!.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function setCookie(
  response: Response,
  name: string,
  value: string,
  maxAge: number
) {
  response.headers.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`
  );
}

export function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function readBoundedJson(
  message: Request | Response,
  limit = 32_768
): Promise<unknown> {
  if (Number(message.headers.get('content-length')) > limit || !message.body)
    throw new Error('Invalid auth payload');
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Invalid auth payload');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function safeNext(value: string | null, origin: string): string | null {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/u.test(value)
  )
    return null;
  try {
    const url = new URL(value, origin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      decodedPath.startsWith('//') ||
      decodedPath.includes('\\') ||
      /^\/(?:en\/|vi\/)?(?:api|verify-token|login)(?:\/|$)/u.test(decodedPath)
    )
      return null;
    // Auth artifacts and nested redirects never survive navigation back to the app.
    for (const key of [
      'token',
      'code',
      'state',
      'next',
      'nextUrl',
      'returnUrl',
      'originApp',
      'targetApp',
    ])
      url.searchParams.delete(key);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`passwords-login-v1.${payload}`)
    .digest();
}

export function createLoginAttempt(
  next: string,
  subject: string | null,
  stepUp: boolean,
  now: number,
  secret: string
) {
  const attempt: LoginAttempt = {
    nonce: randomBytes(32).toString('base64url'),
    next,
    subject,
    stepUp,
    expires: now + LOGIN_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(attempt)).toString('base64url');
  return {
    attempt,
    sealed: `${payload}.${signature(payload, secret).toString('base64url')}`,
  };
}

export function readLoginAttempt(
  value: string | null,
  origin: string,
  now: number,
  secret: string
): LoginAttempt | null {
  if (!value || value.length > 4096) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const actual = Buffer.from(parts[1]!, 'base64url');
    const expected = signature(parts[0]!, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(
      Buffer.from(parts[0]!, 'base64url').toString()
    ) as LoginAttempt;
    if (
      !/^[A-Za-z0-9_-]{43}$/u.test(data.nonce) ||
      !Number.isSafeInteger(data.expires) ||
      data.expires <= now ||
      data.expires > now + LOGIN_TTL_SECONDS ||
      (data.subject !== null && typeof data.subject !== 'string') ||
      typeof data.stepUp !== 'boolean' ||
      safeNext(data.next, origin) !== data.next
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function callbackState(url: URL) {
  const direct = url.searchParams.getAll('state');
  const nested = url.searchParams.getAll('nextUrl');
  if (direct.length > 1 || nested.length > 1) return null;
  if (nested.length) {
    const next = new URL(nested[0]!, url.origin);
    if (
      next.origin !== url.origin ||
      !nested[0]!.startsWith('/') ||
      nested[0]!.startsWith('//')
    )
      return null;
    const states = next.searchParams.getAll('state');
    if (states.length !== 1 || (direct.length && direct[0] !== states[0]))
      return null;
    return states[0] ?? null;
  }
  return direct[0] ?? null;
}
