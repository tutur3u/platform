import {
  type AppMountConfig,
  type ResolvedMount,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import {
  type Admitted,
  authenticate,
  isOwnerEmail,
  type MastermindEnvironment,
  verifyAccessEmail,
} from './auth';
import { fleetReturnPath, isFleetPath } from './fleet-admission';
import {
  exchangeHandoff,
  loginRedirect,
  refreshSession,
  safeNextPath,
  sessionCookies,
  withSessionCookie,
} from './session';

/**
 * Only the dedicated host is admitted. `tuturuuu.com/mastermind` is refused:
 * on the shared origin any Web script could drive this app with the owner's
 * credentials (mastermind-web.mdx#no-apex-path-hosting).
 */
export const mastermindMount = {
  app: 'mastermind',
  rootHosts: ['mastermind.tuturuuu.com'],
  unknownHost: 'reject',
} satisfies AppMountConfig;

/**
 * Documents run only scripts stamped with this response's nonce (and what
 * they load, via 'strict-dynamic'); responses without one run no scripts.
 * Styles stay same-origin: no 'unsafe-inline'.
 */
export function contentSecurityPolicy(nonce?: string) {
  return [
    "default-src 'self'",
    nonce
      ? `script-src 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function secure(response: Response, nonce?: string) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));
  headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('x-tuturuuu-runtime', 'native');
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Server functions are the only mutation path: POST under the app's
 * `_serverFn` base, from this exact origin. Start's CSRF middleware checks
 * the same request again inside the handler.
 */
function admitsMethod(request: Request, url: URL, mount: ResolvedMount) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  if (request.method !== 'POST') return false;
  if (!url.pathname.startsWith(`${mount.basePath}/_serverFn/`)) return false;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return (
    request.headers.get('Origin') === url.origin &&
    (fetchSite === null || fetchSite === 'same-origin')
  );
}

export async function mastermindRequest(
  request: Request,
  env: MastermindEnvironment,
  render: (
    request: Request,
    owner: Admitted,
    mount: ResolvedMount
  ) => Promise<Response> | Response,
  now = Date.now(),
  nonce?: string
) {
  const url = new URL(request.url);
  const mount =
    url.protocol === 'https:' ? resolveAppBase(url, mastermindMount) : null;
  if (!mount) return secure(new Response('Forbidden', { status: 403 }));
  const email = await verifyAccessEmail(request, env, now);
  if (!email) {
    return request.method === 'GET' && url.pathname === '/'
      ? secure(
          new Response(null, { status: 303, headers: { Location: '/login' } })
        )
      : secure(new Response('Forbidden', { status: 403 }));
  }
  // Login and its callback precede the path gate: a grantee needs them to get
  // a session. A grantee always returns to the Fleet page.
  const ownerEmail = isOwnerEmail(env, email);
  const returnPath = (raw: string | null) =>
    ownerEmail ? safeNextPath(raw) : fleetReturnPath(safeNextPath(raw));
  if (request.method === 'GET' && url.pathname === '/login') {
    return secure(
      loginRedirect(returnPath(url.searchParams.get('nextUrl') ?? '/en'))
    );
  }
  if (request.method === 'GET' && url.pathname === '/verify-token') {
    const token = url.searchParams.get('token');
    const session = token
      ? await exchangeHandoff(token, env, email, now)
      : null;
    if (!session) return secure(new Response('Forbidden', { status: 403 }));
    const headers = new Headers({
      Location: returnPath(url.searchParams.get('nextUrl')),
    });
    for (const cookie of sessionCookies(session))
      headers.append('Set-Cookie', cookie);
    return secure(new Response(null, { status: 303, headers }));
  }

  // A Fleet grantee reaches Fleet paths only; nothing else does session work.
  const fleetPath = isFleetPath(request.method, url, mount.basePath);
  if (!ownerEmail && !fleetPath) {
    return secure(new Response('Forbidden', { status: 403 }));
  }

  let admitted = request;
  let owner = await authenticate(request, env, now, fleetPath);
  let issued: string[] = [];
  if (!owner) {
    // An expired access session rotates its refresh credential inline.
    const session = await refreshSession(request, env, email, now);
    if (session) {
      admitted = withSessionCookie(request, session);
      owner = await authenticate(admitted, env, now, fleetPath);
      if (owner) issued = sessionCookies(session);
    }
  }
  if (owner === 'forbidden') {
    return secure(new Response('Forbidden', { status: 403 }));
  }
  if (!owner) {
    const navigation =
      request.method === 'GET' &&
      request.headers.get('Sec-Fetch-Mode') === 'navigate';
    return navigation
      ? secure(loginRedirect(returnPath(`${url.pathname}${url.search}`)))
      : secure(new Response('Forbidden', { status: 403 }));
  }
  if (!admitsMethod(request, url, mount)) {
    return secure(new Response('Method not allowed', { status: 405 }));
  }
  const response = secure(await render(admitted, owner, mount), nonce);
  for (const cookie of issued) response.headers.append('Set-Cookie', cookie);
  return response;
}
