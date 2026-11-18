import type { Env } from './worker';

/** Vercel Deployment Protection bypass request header. */
export const BYPASS_HEADER = 'x-vercel-protection-bypass';
/** Asks Vercel to set a bypass cookie; the gateway authenticates every request itself and never sets it. */
export const BYPASS_COOKIE_HEADER = 'x-vercel-set-bypass-cookie';

/**
 * True for the staging acceptance hostname named by GATEWAY_ACCEPTANCE_HOST.
 * Unset or empty means no host qualifies, so production behavior is unchanged.
 */
export function isAcceptanceHost(request: Request, env: Env) {
  const configured = env.GATEWAY_ACCEPTANCE_HOST?.trim().toLowerCase();
  return !!configured && new URL(request.url).host === configured;
}

/** The Worker secret that reaches the protected staging origin, if usable. */
export function bypassSecret(env: Env) {
  const secret = env.VERCEL_PROTECTION_BYPASS?.trim();
  return secret ? secret : undefined;
}

/**
 * The bypass secret for this origin request: only on the acceptance host and
 * only toward the configured staging WEB_ORIGIN. Any other origin (the
 * Marketing Worker included) and any other host get nothing.
 */
export function bypassSecretFor(request: Request, env: Env, origin: URL) {
  if (!isAcceptanceHost(request, env) || !env.WEB_ORIGIN) return undefined;
  let web: URL;
  try {
    web = new URL(env.WEB_ORIGIN);
  } catch {
    return undefined;
  }
  return web.origin === origin.origin ? bypassSecret(env) : undefined;
}

/** Fail-closed answer for the acceptance host while the secret is missing. */
export function acceptanceUnavailable() {
  return new Response(null, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Sets the bypass header, replacing anything the client sent. */
export function withBypass(headers: Headers, secret: string | undefined) {
  headers.delete(BYPASS_HEADER);
  headers.delete(BYPASS_COOKIE_HEADER);
  if (secret) headers.set(BYPASS_HEADER, secret);
}

/**
 * Removes the bypass headers and any header value that carries the secret, so
 * the secret never reaches a client even if an origin echoes it.
 */
export function scrubBypass(response: Response, secret: string | undefined) {
  if (response.status === 101) return response;
  const dirty =
    response.headers.has(BYPASS_HEADER) ||
    response.headers.has(BYPASS_COOKIE_HEADER) ||
    (!!secret &&
      [...response.headers.values()].some((value) => value.includes(secret)));
  if (!dirty) return response;
  const result = new Response(response.body, response);
  result.headers.delete(BYPASS_HEADER);
  result.headers.delete(BYPASS_COOKIE_HEADER);
  if (secret) {
    for (const [name, value] of [...result.headers.entries()]) {
      if (value.includes(secret)) result.headers.delete(name);
    }
  }
  return result;
}
