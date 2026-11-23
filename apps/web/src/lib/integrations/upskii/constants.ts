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

export const UPSKII_READ_TOKEN_TTL_SECONDS = 60;
