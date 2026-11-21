/**
 * Registry rules for external (third-party) apps, shared by every app that
 * saves registrations or verifies external-app bearers so they cannot drift.
 * Portable: no framework, runtime or database imports.
 */
import {
  APP_DOMAIN_MAP,
  getConfiguredInternalAppDomains,
} from './internal-domains';

/** Scopes reserved for first-party app sessions (`internal-app:session`). */
export const INTERNAL_APP_SCOPE_PREFIX = 'internal-app:';
/** The scope every first-party app session carries. */
export const FIRST_PARTY_APP_SESSION_SCOPE = `${INTERNAL_APP_SCOPE_PREFIX}session`;

/**
 * Internal app names an external registration must never use. App-session
 * verification trusts a token's `target_app` to name a first-party app, so an
 * external app registered under one could mint bearers that pass as it. The
 * names come from the internal app domain registry, which also lists every
 * satellite session audience and the CLI target (`platform`), so a new
 * internal app is reserved as soon as it is registered there.
 */
export function getReservedInternalAppNames() {
  return new Set<string>(
    [
      ...APP_DOMAIN_MAP.map((domain) => domain.name),
      ...getConfiguredInternalAppDomains().map((domain) => domain.name),
    ].map((name) => name.trim().toLowerCase())
  );
}

export function isReservedInternalAppName(name: string) {
  return getReservedInternalAppNames().has(name.trim().toLowerCase());
}

/**
 * Internal token targets with no app domain entry. A registration may not use
 * them either, so no external app can mint bearers shaped like their tokens.
 */
export const INTERNAL_TOKEN_TARGETS = [
  'managed-tuturuuu',
  'profile-media-upload',
] as const;

/** Whether an external registration may not take this app id. */
export function isReservedExternalAppId(appId: string) {
  const name = appId.trim().toLowerCase();
  return (
    isReservedInternalAppName(name) ||
    (INTERNAL_TOKEN_TARGETS as readonly string[]).includes(name)
  );
}

export function isInternalAppScope(scope: string) {
  return scope.trim().toLowerCase().startsWith(INTERNAL_APP_SCOPE_PREFIX);
}

export const EXTERNAL_APP_BEARER_TTL_BOUNDS = {
  max: 86_400,
  min: 300,
} as const;
/** Bearer lifetime cap written on every newly registered app. */
export const DEFAULT_NEW_APP_MAX_BEARER_TTL_SECONDS = 900;

/** A stored bearer cap in seconds, or null when unset or out of bounds. */
export function parseMaxBearerTtlSeconds(value: string | null | undefined) {
  if (!value || !/^\d+$/u.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return seconds >= EXTERNAL_APP_BEARER_TTL_BOUNDS.min &&
    seconds <= EXTERNAL_APP_BEARER_TTL_BOUNDS.max
    ? seconds
    : null;
}

/**
 * The `maxBearerTtlSeconds` registry value a save writes, or undefined to keep
 * the stored one. A new app without a value gets the default cap; an explicit
 * null clears an existing app's cap (a new app still gets the default); an
 * existing app without a value keeps what it has, so apps registered before
 * the field existed keep the session policy TTL.
 */
export function resolveMaxBearerTtlFieldValue({
  isNewApp,
  requested,
}: {
  isNewApp: boolean;
  requested: number | null | undefined;
}) {
  if (requested != null) {
    if (parseMaxBearerTtlSeconds(String(requested)) === null) {
      throw new Error('invalid_max_bearer_ttl');
    }
    return String(requested);
  }
  if (isNewApp) return String(DEFAULT_NEW_APP_MAX_BEARER_TTL_SECONDS);
  return requested === null ? '' : undefined;
}

/**
 * Throws for a registration an external app must not have: a reserved
 * internal app name, or a first-party session scope.
 */
export function assertExternalAppRegistrationAllowed({
  allowedScopes,
  appId,
}: {
  allowedScopes?: readonly string[];
  appId: string;
}) {
  if (isReservedExternalAppId(appId)) throw new Error('reserved_app_id');
  if (allowedScopes?.some(isInternalAppScope)) {
    throw new Error('internal_scope_not_allowed');
  }
}

/**
 * True when a bearer was minted before the app's current secret was issued.
 * Bearers do not carry the secret, so a rotation revokes them here; refresh
 * needs the current secret, so a client holding it mints a fresh bearer.
 * A missing `secretIssuedAt` means no secret was ever issued, so nothing to
 * compare; an unreadable one fails closed.
 */
export function wasIssuedBeforeSecretRotation(
  claims: { iat?: unknown },
  secretIssuedAt: string | null
) {
  if (!secretIssuedAt) return false;

  const secretIssuedAtMs = Date.parse(secretIssuedAt);
  if (!Number.isFinite(secretIssuedAtMs) || typeof claims.iat !== 'number') {
    return true;
  }

  // `iat` has whole-second precision; compare at the same precision so a
  // bearer minted in the rotation's second, after it, stays valid.
  return claims.iat < Math.floor(secretIssuedAtMs / 1000);
}
