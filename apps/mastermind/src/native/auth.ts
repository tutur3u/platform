import { verifyAppSessionRequestWithToken } from '@tuturuuu/auth/app-session-core';
import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { hasLiveFleetGrant, hasLiveRootAccess } from './permission';

export interface MastermindEnvironment {
  ASSETS?: AssetsBinding;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  MASTERMIND_OWNER_EMAIL?: string;
  OWNER_IDS?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  OPS_HUB?: { fetch(request: Request): Promise<Response> };
}
export function assertMastermindEnvironment(env: MastermindEnvironment): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Mastermind requires production mode');
  }
  const required = [
    env.CF_ACCESS_TEAM_DOMAIN,
    env.CF_ACCESS_AUD,
    env.MASTERMIND_OWNER_EMAIL,
    env.OWNER_IDS,
    env.TUTURUUU_APP_COORDINATION_SECRET,
  ];
  if (required.some((value) => !value?.trim())) {
    throw new Error('Required Mastermind environment is missing');
  }
}

// Keep jose's cache and cooldown alive across requests within this isolate.
const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function accessKeys(issuer: URL) {
  let keys = accessKeySets.get(issuer.origin);
  if (!keys) {
    keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
      cooldownDuration: 300_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    });
    if (accessKeySets.size >= 8) accessKeySets.clear();
    accessKeySets.set(issuer.origin, keys);
  }
  return keys;
}

export type Owner = {
  id: string;
  email: string;
  token: string;
  expiresAt: number;
};

/**
 * An admitted caller. `owner` reaches every route; `fleet` is a live Fleet
 * grantee admitted only to Fleet paths (fleet-admission.ts).
 */
export type Admitted = Owner & { role: 'owner' | 'fleet' };

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

/**
 * The Cloudflare Access identity: the email of a verified
 * `Cf-Access-Jwt-Assertion` on the dedicated HTTPS host, or null. The Access
 * policy decides who reaches the Worker; `authenticate` decides what each
 * identity may open.
 */
export async function verifyAccessEmail(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now()
): Promise<string | null> {
  try {
    const url = new URL(request.url);
    // Never trust forwarded host headers to turn a preview into the canonical host.
    if (url.protocol !== 'https:' || url.hostname !== 'mastermind.tuturuuu.com')
      return null;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (
      !token ||
      !env.CF_ACCESS_TEAM_DOMAIN ||
      !env.CF_ACCESS_AUD ||
      !env.MASTERMIND_OWNER_EMAIL
    )
      return null;
    const issuer = new URL(`https://${env.CF_ACCESS_TEAM_DOMAIN}`);
    if (
      !issuer.hostname.endsWith('.cloudflareaccess.com') ||
      issuer.host !== env.CF_ACCESS_TEAM_DOMAIN
    )
      return null;
    const keys = accessKeys(issuer);
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: issuer.origin,
      audience: env.CF_ACCESS_AUD,
      requiredClaims: ['exp', 'iat', 'email'],
      currentDate: new Date(now),
    });
    if (
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.iat !== 'number' ||
      payload.iat * 1000 > now
    )
      return null;
    return payload.email;
  } catch {
    return null;
  }
}

/** The allowlisted owner ids; missing or empty admits nobody. */
export function ownerIds(env: MastermindEnvironment) {
  return (env.OWNER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The owner's Access email admits only the allowlisted owner ids. */
export function isOwnerEmail(env: MastermindEnvironment, email: string) {
  return email === env.MASTERMIND_OWNER_EMAIL;
}

/**
 * The session must belong to the Access identity. The owner's email needs an
 * allowlisted id and live root `manage_mastermind`, as before Fleet access.
 * Any other email needs a Fleet path, a non-owner id and a live non-Owner
 * Fleet grant, checked on every request without a memo. `forbidden` marks a valid session that this path
 * does not admit, so the caller answers 403 instead of sending it to login.
 */
export async function authenticate(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now(),
  fleetPath = false
): Promise<Admitted | 'forbidden' | null> {
  try {
    const email = await verifyAccessEmail(request, env, now);
    if (!email) return null;
    const user = getSatelliteAppSessionUser('mastermind', request, env, now);
    if (!user || user.email !== email) return null;
    if (isOwnerEmail(env, email)) {
      if (!ownerIds(env).includes(user.id)) return null;
      return (await hasLiveRootAccess(user))
        ? { ...user, role: 'owner' }
        : null;
    }
    // An owner id never takes the grantee path, whatever its Access email.
    if (!fleetPath || ownerIds(env).includes(user.id)) return 'forbidden';
    return (await hasLiveFleetGrant(user.token))
      ? { ...user, role: 'fleet' }
      : 'forbidden';
  } catch {
    return null;
  }
}
