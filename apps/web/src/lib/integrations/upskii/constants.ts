/** Registered external app id of Upskii in the Tuturuuu app registry. */
export const UPSKII_APP_ID = 'upskii';

/** Exchange scope that only lets Upskii create a link for the signed-in user. */
export const UPSKII_LINK_WRITE_SCOPE = 'upskii-link:write';

/** Read-only scopes a link can grant, sorted. */
export const UPSKII_READ_SCOPES = [
  'upskii:assessments:read',
  'upskii:classes:read',
  'upskii:lessons:read',
] as const;

export type UpskiiReadScope = (typeof UPSKII_READ_SCOPES)[number];

export function isUpskiiReadScope(value: string): value is UpskiiReadScope {
  return (UPSKII_READ_SCOPES as readonly string[]).includes(value);
}

/** Read tokens name their link with this scope prefix. */
export const EXTERNAL_LINK_ID_SCOPE_PREFIX = 'external-link:';

/**
 * A read token for one class's lessons or assessments also names that class
 * with this scope prefix, so a token minted for one class opens no other.
 */
export const UPSKII_CLASS_SCOPE_PREFIX = 'upskii-class:';

/** The shape of a class id Upskii accepts, enforced before a token names it. */
const UPSKII_CLASS_ID_PATTERN = /^[\w-]{1,128}$/u;

export function isUpskiiClassId(value: string) {
  return UPSKII_CLASS_ID_PATTERN.test(value);
}

export const UPSKII_READ_TOKEN_TTL_SECONDS = 60;
