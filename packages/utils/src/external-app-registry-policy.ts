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

/**
 * What each wildcard grant covers. `external-projects:*` covers the external
 * project scopes that existed when apps were first granted it. A scope added
 * later, a bare `*` and every other wildcard cover nothing, so adding a scope
 * never widens an app that already holds a wildcard: it needs an explicit
 * grant and an explicit request.
 */
export const WILDCARD_SCOPE_COVERAGE: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  'external-projects:*': Object.freeze([
    'external-projects:manage',
    'external-projects:publish',
    'external-projects:read',
  ]),
});

/** Whether one granted scope (exact or wildcard) covers `scope`. */
export function scopeGrantCovers(grant: string, scope: string) {
  if (grant === scope) return true;
  return WILDCARD_SCOPE_COVERAGE[grant]?.includes(scope) ?? false;
}

/** Whether any of `grants` covers `scope`. */
export function hasGrantedScope(grants: readonly string[], scope: string) {
  return grants.some((grant) => scopeGrantCovers(grant, scope));
}

/** Whether `scope` is a wildcard grant (`*` or anything ending in `:*`). */
export function isWildcardScope(scope: string) {
  return scope === '*' || scope.endsWith(':*');
}

/**
 * The scopes an issued token carries for a granted set: each wildcard with a
 * frozen coverage list becomes that list, and every other wildcard is
 * dropped, so a token never carries a literal wildcard.
 */
export function expandWildcardScopes(scopes: readonly string[]) {
  const expanded = scopes.flatMap((scope) =>
    isWildcardScope(scope) ? (WILDCARD_SCOPE_COVERAGE[scope] ?? []) : [scope]
  );
  return [...new Set(expanded)].sort();
}

const SCOPE_PATTERN = /^[a-z0-9:*._-]{1,80}$/u;

function normalizeRequestedScopes(values: readonly string[]) {
  const scopes = values
    .map((scope) => scope.trim())
    .filter((scope) => SCOPE_PATTERN.test(scope));
  return [...new Set(scopes)].sort();
}

/**
 * The scopes an app token carries. First-party session scopes are never
 * issued to an external app, even when a registration saved before they were
 * refused lists them. With no requested scopes the token carries the app's
 * allowed scopes; otherwise every requested scope must be covered by an
 * allowed one, or the whole request fails with `app_scope_not_allowed`.
 */
export function getAllowedAppTokenScopes({
  allowedScopes,
  requestedScopes,
}: {
  allowedScopes: readonly string[];
  requestedScopes: readonly string[];
}) {
  const allowed = normalizeRequestedScopes(allowedScopes).filter(
    (scope) => !isInternalAppScope(scope)
  );
  const requested = normalizeRequestedScopes(requestedScopes);

  if (requested.some(isInternalAppScope)) {
    throw new Error('app_scope_not_allowed');
  }
  if (requested.length === 0) return allowed;
  if (requested.some((scope) => !hasGrantedScope(allowed, scope))) {
    throw new Error('app_scope_not_allowed');
  }
  return requested;
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
 * internal app name, a first-party session scope, or a wildcard scope
 * without a frozen coverage list (only `external-projects:*` has one).
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
  if (
    allowedScopes?.some(
      (scope) =>
        isWildcardScope(scope.trim()) && !WILDCARD_SCOPE_COVERAGE[scope.trim()]
    )
  ) {
    throw new Error('wildcard_scope_not_allowed');
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

export const EXTERNAL_APP_LOGO_URL_MAX_LENGTH = 2048;

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
const PRIVATE_HOST_SUFFIXES = [
  '.home.arpa',
  '.internal',
  '.lan',
  '.local',
  '.localdomain',
  '.localhost',
];

/**
 * A registered app's logo URL, or null when it is unset or not allowed.
 * Only public https URLs pass: no credentials, IP literals or local hostnames,
 * because the platform fetches the image server-side to serve it from its own
 * origin. This is a best-effort syntactic check; it does not resolve DNS.
 */
export function parseExternalAppLogoUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > EXTERNAL_APP_LOGO_URL_MAX_LENGTH) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // A trailing dot names the same host, so it must not dodge the checks.
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !host.includes('.') ||
    host.startsWith('[') ||
    IPV4_LITERAL.test(host) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return null;
  }

  return url.toString();
}
