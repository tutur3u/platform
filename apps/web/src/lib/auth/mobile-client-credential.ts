import { createHash } from 'node:crypto';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/utils/app-coordination-token';

/**
 * Server-signed native mobile client credential.
 *
 * Issued only by mobile sign-in endpoints that already refuse browser requests
 * and require a Turnstile-gated login, or by the Turnstile-gated mint endpoint.
 * It is NOT an auth token: it rides alongside the Supabase bearer in
 * `x-tuturuuu-mobile-client`, is bound to that bearer's user and Supabase
 * session, and satisfies the browser-shape mutation heuristic. Fleet separately requires
 * a scope from a server-recorded native session. Server
 * restrictions and explicit server challenges still win.
 */
export const MOBILE_CLIENT_HEADER = 'x-tuturuuu-mobile-client';
export const MOBILE_CLIENT_ORIGIN_APP = 'mobile';
export const MOBILE_CLIENT_TARGET_APP = 'platform';
export const MOBILE_CLIENT_SCOPE = 'mobile:client';
const MASTERMIND_MOBILE_SESSION_SCOPE = 'mobile:mastermind-session';
/** One Turnstile pass (login or mint) buys at most one day of native trust. */
export const MOBILE_CLIENT_TTL_SECONDS = 24 * 60 * 60;
const MOBILE_CLIENT_SESSION_SCOPE_PREFIX = 'mobile:sid:';
const MAX_HEADER_LENGTH = 4096;

type TokenOptions = { now?: Date; secret?: string };

/**
 * SHA-256 (base64url) of the Supabase `session_id`. The credential scope
 * carries it, and the mint endpoint requires it as the Turnstile `cData`, so
 * a solve is bound to this one session.
 */
export function mobileClientSessionBinding(sessionId: string) {
  return createHash('sha256').update(sessionId).digest('base64url');
}

function sessionBindingScope(sessionId: string) {
  return `${MOBILE_CLIENT_SESSION_SCOPE_PREFIX}${mobileClientSessionBinding(sessionId)}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads `session_id` from a Supabase access token whose subject is `userId`.
 * Callers must pass a token Supabase already verified for this request (the
 * request bearer after session resolution, or a session Supabase just issued).
 */
export function readSupabaseSessionId(
  accessToken: string | null | undefined,
  userId: string
) {
  if (!accessToken) return null;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || payload.sub !== userId) return null;
  const sessionId = payload.session_id;
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : null;
}

export function getRequestBearerToken(headers: Pick<Headers, 'get'>) {
  const authorization = headers.get('authorization');
  return authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim() || null
    : null;
}

export function createMobileClientCredential(
  {
    sessionId,
    userId,
    mastermindSession = false,
  }: {
    sessionId: string;
    userId: string;
    mastermindSession?: boolean;
  },
  options: TokenOptions = {}
) {
  // No email claim: the verifier never reads it and the payload is readable.
  const { claims, expiresAt, token } = createAppCoordinationToken(
    {
      email: null,
      expiresInSeconds: MOBILE_CLIENT_TTL_SECONDS,
      originApp: MOBILE_CLIENT_ORIGIN_APP,
      scopes: [
        MOBILE_CLIENT_SCOPE,
        sessionBindingScope(sessionId),
        ...(mastermindSession ? [MASTERMIND_MOBILE_SESSION_SCOPE] : []),
      ],
      targetApp: MOBILE_CLIENT_TARGET_APP,
      userId,
    },
    options
  );
  return { claims, expiresAt, token };
}

/**
 * Issues a credential for a Supabase session a mobile sign-in just created.
 * Returns undefined when the session cannot be bound, so sign-in never fails
 * because of this optional trust signal.
 */
export function issueMobileClientCredentialForSession(
  session: { access_token: string },
  user: { id: string } | null | undefined,
  mastermindSession = false
) {
  if (!user) return undefined;
  const sessionId = readSupabaseSessionId(session.access_token, user.id);
  if (!sessionId) return undefined;
  try {
    const { expiresAt, token } = createMobileClientCredential({
      sessionId,
      userId: user.id,
      mastermindSession,
    });
    return { expires_at: expiresAt, token };
  } catch {
    return undefined;
  }
}

/**
 * True only for a signature-valid, unexpired mobile client credential bound
 * to exactly this user and Supabase session. Every other shape is rejected:
 * app sessions, CLI tokens, refresh tokens and credentials for another user or
 * session cannot satisfy it.
 */
export function verifyMobileClientCredential(
  token: string | null | undefined,
  {
    sessionId,
    userId,
    requireMastermindSession = false,
  }: {
    sessionId: string | null;
    userId: string;
    requireMastermindSession?: boolean;
  },
  options: TokenOptions = {}
) {
  if (!token || token.length > MAX_HEADER_LENGTH || !sessionId) return false;
  const verification = verifyAppCoordinationToken(token, options);
  if (!verification.ok) return false;
  const { claims } = verification;
  const hasMastermindSession =
    claims.scopes[2] === MASTERMIND_MOBILE_SESSION_SCOPE;
  return (
    claims.sub === userId &&
    claims.origin_app === MOBILE_CLIENT_ORIGIN_APP &&
    claims.target_app === MOBILE_CLIENT_TARGET_APP &&
    claims.workspace_id === undefined &&
    claims.scopes.length === (hasMastermindSession ? 3 : 2) &&
    (!requireMastermindSession || hasMastermindSession) &&
    claims.scopes[0] === MOBILE_CLIENT_SCOPE &&
    claims.scopes[1] === sessionBindingScope(sessionId)
  );
}

/**
 * Resolves the native trust signal for a Supabase-bearer request whose user
 * was already authenticated. Requests without a bearer (cookie sessions)
 * never qualify.
 */
export function hasVerifiedMobileClientCredential(
  request: { headers: Pick<Headers, 'get'> },
  userId: string,
  requireMastermindSession = false
) {
  const credential = request.headers.get(MOBILE_CLIENT_HEADER);
  if (!credential) return false;
  return verifyMobileClientCredential(credential, {
    sessionId: readSupabaseSessionId(
      getRequestBearerToken(request.headers),
      userId
    ),
    userId,
    requireMastermindSession,
  });
}
