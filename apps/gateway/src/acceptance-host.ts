import type { Env } from './worker';

/**
 * True for the staging acceptance hostname named by GATEWAY_ACCEPTANCE_HOST.
 * Unset or empty means no host qualifies, so production behavior is unchanged.
 */
export function isAcceptanceHost(request: Request, env: Env) {
  const configured = env.GATEWAY_ACCEPTANCE_HOST?.trim().toLowerCase();
  return !!configured && new URL(request.url).host === configured;
}

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

/** `GET`/`HEAD /robots.txt` on the acceptance host: disallow everything. */
export function acceptanceRobots(request: Request, env: Env) {
  if (!isAcceptanceHost(request, env)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (new URL(request.url).pathname !== '/robots.txt') return null;
  return new Response(request.method === 'HEAD' ? null : ROBOTS_TXT, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
