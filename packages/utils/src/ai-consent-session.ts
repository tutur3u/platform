import {
  createAppCoordinationToken,
  getBearerAppCoordinationToken,
  isAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';

/**
 * Mira AI data consent (Apple 5.1.2(i)) for app-coordination sessions.
 *
 * App sessions (`ttr_app_*`) are minted from one-time cross-app handoffs. Any
 * signed-in user can mint a handoff directly through Supabase, so a handoff
 * counts as browser-originated only when it carries a server-signed browser
 * origin transfer, written by a Tuturuuu server route that authenticated a
 * cookie session. Every other handoff yields an app session stamped with
 * `AI_CONSENT_REQUIRED_SCOPE`, and requests carrying such a session follow the
 * native consent rule. The scope is signed into the token, so it cannot be
 * removed without invalidating the session.
 */
export const AI_CONSENT_REQUIRED_SCOPE = 'ai:consent-required';

const BROWSER_ORIGIN_TRANSFER_SCOPE = 'ai-consent:browser-origin';
const BROWSER_ORIGIN_TRANSFER_TTL_SECONDS = 300;

/**
 * Whether [request] is a native-style caller: a non-app-session bearer token,
 * or any app session stamped as consent-required (bearer or cookie).
 */
export function requestRequiresAiDataConsent(
  request: Pick<Request, 'headers'>
) {
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(\S+)/iu)?.[1];
  if (bearer && !isAppCoordinationToken(bearer)) return true;
  return requestCarriesConsentRequiredAppSession(request);
}

/** Whether a verified app-coordination token carries the consent stamp. */
export function appSessionRequiresAiConsent(token: string) {
  const verification = verifyAppCoordinationToken(token);
  return (
    verification.ok &&
    verification.claims.scopes.includes(AI_CONSENT_REQUIRED_SCOPE)
  );
}

function requestCarriesConsentRequiredAppSession(
  request: Pick<Request, 'headers'>
) {
  const tokens = new Set<string>();
  const bearer = getBearerAppCoordinationToken(request);
  if (bearer) tokens.add(bearer);
  for (const part of request.headers.get('cookie')?.split(';') ?? []) {
    const value = part.slice(part.indexOf('=') + 1).trim();
    if (!part.includes('=') || !isAppCoordinationToken(value)) continue;
    try {
      tokens.add(decodeURIComponent(value));
    } catch {
      tokens.add(value);
    }
  }
  for (const token of tokens) {
    if (appSessionRequiresAiConsent(token)) return true;
  }
  return false;
}

/**
 * session_data is caller writable. The browser origin travels as a short
 * lived signed transfer bound to the handoff identity and target app.
 */
export function createAiConsentBrowserOriginTransfer(
  userId: string,
  targetApp: string
) {
  return createAppCoordinationToken({
    expiresInSeconds: BROWSER_ORIGIN_TRANSFER_TTL_SECONDS,
    scopes: [BROWSER_ORIGIN_TRANSFER_SCOPE],
    targetApp,
    userId,
  }).token;
}

/**
 * Transfer for a handoff minted by [request]: present only when the minting
 * request is a cookie session that is not itself consent-required.
 */
export function aiConsentBrowserOriginTransferFor(
  request: Pick<Request, 'headers'>,
  userId: string,
  targetApp: string
) {
  return requestRequiresAiDataConsent(request)
    ? undefined
    : createAiConsentBrowserOriginTransfer(userId, targetApp);
}

/** True only for a valid transfer bound to [userId] and [targetApp]. */
export function readAiConsentBrowserOriginTransfer(
  value: unknown,
  userId: string,
  targetApp: string
) {
  if (typeof value !== 'string') return false;
  const verified = verifyAppCoordinationToken(value);
  return (
    verified.ok &&
    verified.claims.sub === userId &&
    verified.claims.target_app === targetApp &&
    verified.claims.scopes.includes(BROWSER_ORIGIN_TRANSFER_SCOPE)
  );
}
