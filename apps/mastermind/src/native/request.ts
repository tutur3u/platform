import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { authenticate, type MastermindEnvironment, type Owner } from './auth';

const mount = {
  app: 'mastermind',
  rootHosts: ['mastermind.tuturuuu.com'],
  unknownHost: 'reject',
} satisfies AppMountConfig;

export function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
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
export async function mastermindRequest(
  request: Request,
  env: MastermindEnvironment,
  render: (request: Request, owner: Owner) => Promise<Response> | Response,
  now = Date.now()
) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || !resolveAppBase(url, mount)) {
    return secure(new Response('Forbidden', { status: 403 }));
  }
  const owner = await authenticate(request, env, now);
  if (!owner && request.method === 'GET' && url.pathname === '/') {
    return secure(
      new Response(null, { status: 303, headers: { Location: '/login' } })
    );
  }
  if (!owner) return secure(new Response('Forbidden', { status: 403 }));
  if (!['GET', 'HEAD'].includes(request.method)) {
    return secure(new Response('Method not allowed', { status: 405 }));
  }
  return secure(await render(request, owner));
}
