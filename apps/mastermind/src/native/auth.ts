import { verifyAppSessionRequestWithToken } from '@tuturuuu/auth/app-session-core';
import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { createLocalJWKSet, jwtVerify } from 'jose';

export interface MastermindEnvironment {
  ASSETS?: AssetsBinding;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_CERTS?: string;
  MASTERMIND_OWNER_EMAIL?: string;
  OWNER_IDS?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  OPS_HUB?: { fetch(request: Request): Promise<Response> };
}
export type Owner = {
  id: string;
  email: string;
  token: string;
  expiresAt: number;
};

/** Native, request-injected satellite adapter. No fallback identity or data lookup. */
export function getSatelliteAppSessionUser(
  app: 'mastermind',
  request: Request,
  env: MastermindEnvironment,
  now: number
): Owner | null {
  if (!env.TUTURUUU_APP_COORDINATION_SECRET?.trim()) return null;
  const result = verifyAppSessionRequestWithToken(request, {
    targetApp: app,
    secret: env.TUTURUUU_APP_COORDINATION_SECRET,
    now: new Date(now),
  });
  if (!result.ok) return null;
  const { claims, token } = result;
  // Require a short-lived access session; refresh credentials cannot pass.
  if (
    claims.exp - claims.iat > 300 ||
    claims.iat * 1000 > now ||
    !claims.email ||
    !claims.sub
  )
    return null;
  return {
    id: claims.sub,
    email: claims.email,
    token,
    expiresAt: claims.exp * 1000,
  };
}

export async function authenticate(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now()
): Promise<Owner | null> {
  try {
    const url = new URL(request.url);
    // Never trust forwarded host headers to turn a preview into the canonical host.
    if (
      url.protocol !== 'https:' ||
      !(
        url.hostname === 'mastermind.tuturuuu.com' ||
        (url.hostname === 'tuturuuu.com' &&
          (url.pathname === '/mastermind' ||
            url.pathname.startsWith('/mastermind/')))
      )
    )
      return null;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (
      !token ||
      !env.CF_ACCESS_TEAM_DOMAIN ||
      !env.CF_ACCESS_AUD ||
      !env.CF_ACCESS_CERTS ||
      !env.MASTERMIND_OWNER_EMAIL
    )
      return null;
    const issuer = new URL(`https://${env.CF_ACCESS_TEAM_DOMAIN}`);
    if (
      !issuer.hostname.endsWith('.cloudflareaccess.com') ||
      issuer.host !== env.CF_ACCESS_TEAM_DOMAIN
    )
      return null;
    const keys = createLocalJWKSet(JSON.parse(env.CF_ACCESS_CERTS));
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: issuer.origin,
      audience: env.CF_ACCESS_AUD,
      requiredClaims: ['exp', 'iat', 'email'],
      currentDate: new Date(now),
    });
    if (
      payload.email !== env.MASTERMIND_OWNER_EMAIL ||
      typeof payload.iat !== 'number' ||
      payload.iat * 1000 > now
    )
      return null;
    const owner = getSatelliteAppSessionUser('mastermind', request, env, now);
    if (!owner || owner.email !== payload.email) return null;
    // Transitional owner-only mode until live manage_mastermind checks land.
    // Re-read on EVERY request, before any memo, API call or render.
    const allowed = (env.OWNER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return allowed.includes(owner.id) ? owner : null;
  } catch {
    return null;
  }
}
