import {
  type AppMountConfig,
  type ResolvedMount,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { authenticate, type MastermindEnvironment, type Owner } from './auth';

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
    owner: Owner,
    mount: ResolvedMount
  ) => Promise<Response> | Response,
  now = Date.now(),
  nonce?: string
) {
  const url = new URL(request.url);
  const mount =
    url.protocol === 'https:' ? resolveAppBase(url, mastermindMount) : null;
  if (!mount) return secure(new Response('Forbidden', { status: 403 }));
  const owner = await authenticate(request, env, now);
  if (!owner && request.method === 'GET' && url.pathname === '/') {
    return secure(
      new Response(null, { status: 303, headers: { Location: '/login' } })
    );
  }
  if (!owner) return secure(new Response('Forbidden', { status: 403 }));
  if (!admitsMethod(request, url, mount)) {
    return secure(new Response('Method not allowed', { status: 405 }));
  }
  return secure(await render(request, owner, mount), nonce);
}
