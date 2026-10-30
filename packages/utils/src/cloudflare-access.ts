/**
 * Cloudflare Access helpers for staging Workers that sit behind Access.
 *
 * Portable: Web APIs and `jose` only, no framework or `cloudflare:*` imports.
 * Configuration is injected per call; nothing is read from request globals.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Request headers that carry Access identity or service credentials. */
export const CLOUDFLARE_ACCESS_REQUEST_HEADERS = [
  'cf-access-jwt-assertion',
  'cf-access-authenticated-user-email',
  'cf-access-client-id',
  'cf-access-client-secret',
] as const;

/** Cookies Access sets on protected hosts. Matched by exact parsed name. */
export const CLOUDFLARE_ACCESS_COOKIES = [
  'CF_Authorization',
  'CF_AppSession',
  'CF_Binding',
] as const;

const accessCookieNames = new Set<string>(CLOUDFLARE_ACCESS_COOKIES);

function cookieName(pair: string) {
  const index = pair.indexOf('=');
  return (index === -1 ? pair : pair.slice(0, index)).trim();
}

/**
 * Removes Access credentials from headers that are about to leave this Worker.
 * Cookie pairs are split and compared by exact name, so a cookie such as
 * `xCF_Authorization` survives and `CF_Authorization` never does.
 */
export function stripCloudflareAccessCredentials(headers: Headers) {
  for (const name of CLOUDFLARE_ACCESS_REQUEST_HEADERS) headers.delete(name);
  const cookie = headers.get('cookie');
  if (cookie === null) return headers;
  const kept = cookie
    .split(';')
    .filter((pair) => pair.trim() && !accessCookieNames.has(cookieName(pair)));
  if (kept.length) headers.set('cookie', kept.join(';').trim());
  else headers.delete('cookie');
  return headers;
}

export interface CloudflareAccessServiceToken {
  clientId?: string;
  clientSecret?: string;
}

export type ServiceTokenResult =
  | { ok: true; request: Request }
  | { ok: false; reason: 'origin-mismatch' | 'missing-token' | 'redirect' };

/**
 * Attaches an Access service token only when the request targets exactly
 * `issuerOrigin` (scheme, host and port) and will not follow redirects, so the
 * token can never be replayed to another origin.
 */
export function withCloudflareAccessServiceToken(
  request: Request,
  issuerOrigin: string,
  token: CloudflareAccessServiceToken
): ServiceTokenResult {
  let target: string;
  let issuer: string;
  try {
    target = new URL(request.url).origin;
    issuer = new URL(issuerOrigin).origin;
  } catch {
    return { ok: false, reason: 'origin-mismatch' };
  }
  if (issuer !== issuerOrigin || target !== issuer)
    return { ok: false, reason: 'origin-mismatch' };
  if (request.redirect !== 'manual' && request.redirect !== 'error')
    return { ok: false, reason: 'redirect' };
  const clientId = token.clientId?.trim();
  const clientSecret = token.clientSecret?.trim();
  if (!clientId || !clientSecret) return { ok: false, reason: 'missing-token' };
  const headers = stripCloudflareAccessCredentials(
    new Headers(request.headers)
  );
  headers.set('cf-access-client-id', clientId);
  headers.set('cf-access-client-secret', clientSecret);
  return { ok: true, request: new Request(request, { headers }) };
}

export interface CloudflareAccessJwtConfig {
  /** Team domain, e.g. `tuturuuu.cloudflareaccess.com`. */
  teamDomain?: string;
  /** The Access application's AUD tag. */
  audience?: string;
}

// Keep jose's key cache and cooldown alive across requests in this isolate.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function accessKeys(issuer: URL) {
  let keys = keySets.get(issuer.origin);
  if (!keys) {
    keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
      cooldownDuration: 300_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    });
    if (keySets.size >= 8) keySets.clear();
    keySets.set(issuer.origin, keys);
  }
  return keys;
}

/** The team issuer origin, or null unless it is an exact Access team host. */
export function cloudflareAccessIssuer(teamDomain: string | undefined) {
  const value = teamDomain?.trim();
  if (!value) return null;
  try {
    const issuer = new URL(`https://${value}`);
    if (
      issuer.host !== value ||
      issuer.hostname !== value.toLowerCase() ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/u.test(
        issuer.hostname
      )
    )
      return null;
    return issuer;
  } catch {
    return null;
  }
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header Access adds to every request
 * it lets through (RS256, team issuer, application AUD). Returns false on any
 * missing configuration, missing header or invalid token: callers fail closed.
 */
export async function verifyCloudflareAccessRequest(
  request: Request,
  config: CloudflareAccessJwtConfig,
  now = Date.now()
): Promise<boolean> {
  const issuer = cloudflareAccessIssuer(config.teamDomain);
  const audience = config.audience?.trim();
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!issuer || !audience || !token) return false;
  try {
    const { payload } = await jwtVerify(token, accessKeys(issuer), {
      algorithms: ['RS256'],
      issuer: issuer.origin,
      audience,
      requiredClaims: ['exp', 'iat'],
      currentDate: new Date(now),
    });
    // Allow one minute of edge clock skew; never a token issued later.
    return (
      typeof payload.iat === 'number' && payload.iat * 1000 <= now + 60_000
    );
  } catch {
    return false;
  }
}
