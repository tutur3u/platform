import {
  APP_SESSION_REFRESH_COOKIE_NAME,
  verifyAppSessionRefreshToken,
  verifyAppSessionRequestWithToken,
} from '@tuturuuu/auth/app-session-core';
import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { isMfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { hasLiveFleetGrant, hasLiveRootAccess } from './permission';

export interface MastermindEnvironment {
  ASSETS?: AssetsBinding;
  MASTERMIND_OWNER_EMAIL?: string;
  OWNER_IDS?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  /** `true` signs each sign-in as a Web-verified transaction (secret, default off). */
  MASTERMIND_SIGNIN_TRANSACTION?: string;
  OPS_HUB?: { fetch(request: Request): Promise<Response> };
}
export function assertMastermindEnvironment(env: MastermindEnvironment): void {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Mastermind requires production mode');
  }
  const required = [
    env.MASTERMIND_OWNER_EMAIL,
    env.OWNER_IDS,
    env.TUTURUUU_APP_COORDINATION_SECRET,
  ];
  if (required.some((value) => !value?.trim())) {
    throw new Error('Required Mastermind environment is missing');
  }
}

/** An owner's second-factor check admits for at most a day. */
export const OWNER_MFA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type Owner = {
  id: string;
  email: string;
  token: string;
  expiresAt: number;
  /** The session carries Web's MFA proof, verified within the last day. */
  mfa: boolean;
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
  // Refresh carries the proof forward, so its age, not the session's, bounds
  // how long one second-factor check admits the owner.
  const mfa =
    isMfaSessionProof(claims.mfa) &&
    claims.mfa.verifiedAt * 1000 <= now &&
    now - claims.mfa.verifiedAt * 1000 <= OWNER_MFA_MAX_AGE_MS &&
    (claims.mfa.expiresAt === undefined || claims.mfa.expiresAt * 1000 > now);
  return {
    id: claims.sub,
    email: claims.email,
    token,
    expiresAt: claims.exp * 1000,
    mfa,
  };
}

/** The allowlisted owner ids; missing or empty admits nobody. */
export function ownerIds(env: MastermindEnvironment) {
  return (env.OWNER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isOwnerEmail(env: MastermindEnvironment, email: string) {
  return !!env.MASTERMIND_OWNER_EMAIL && email === env.MASTERMIND_OWNER_EMAIL;
}

/**
 * The subject of the request's own session, from local signature checks only
 * (the access session, else the refresh credential), so a path gate can run
 * before any refresh or permission call. Null when neither verifies.
 */
export function sessionSubject(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now()
): string | null {
  const secret = env.TUTURUUU_APP_COORDINATION_SECRET?.trim();
  if (!secret) return null;
  const access = getSatelliteAppSessionUser('mastermind', request, env, now);
  if (access) return access.id;
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== APP_SESSION_REFRESH_COOKIE_NAME) continue;
    const refresh = verifyAppSessionRefreshToken(value.join('='), {
      secret,
      targetApp: 'mastermind',
      now: new Date(now),
    });
    return refresh.ok ? refresh.claims.sub : null;
  }
  return null;
}

/**
 * The verified Tuturuuu session is the only identity. An owner id needs the
 * owner email, an MFA (aal2) proof and live root `manage_mastermind`; it never
 * takes the grantee path. Any other subject needs a Fleet path and a live
 * non-Owner Fleet grant, checked on every request without a memo.
 * `forbidden` marks a valid session this path does not admit and `mfa` an
 * owner session without MFA, so the caller answers 403 instead of sending it
 * to login again. Null means no valid session.
 */
export async function authenticate(
  request: Request,
  env: MastermindEnvironment,
  now = Date.now(),
  fleetPath = false
): Promise<Admitted | 'forbidden' | 'mfa' | null> {
  try {
    const user = getSatelliteAppSessionUser('mastermind', request, env, now);
    if (!user) return null;
    if (ownerIds(env).includes(user.id)) {
      if (!isOwnerEmail(env, user.email)) return 'forbidden';
      if (!user.mfa) return 'mfa';
      return (await hasLiveRootAccess(user))
        ? { ...user, role: 'owner' }
        : 'forbidden';
    }
    if (!fleetPath) return 'forbidden';
    return (await hasLiveFleetGrant(user.token))
      ? { ...user, role: 'fleet' }
      : 'forbidden';
  } catch {
    return null;
  }
}
