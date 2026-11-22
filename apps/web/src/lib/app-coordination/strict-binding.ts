/**
 * Strict external-app workspace binding (`EXTERNAL_APP_STRICT_BINDING`).
 *
 * Strict binding covers three checks: the exchange refuses workspace scopes
 * without `workspaceId`, a refresh token without a workspace is refused for
 * them, and member emails need `workspace.members.email:read`. It applies to
 * every app. Risk acceptance RA-MEDIA-C1-001 exempts the apps listed below
 * from those three checks only, until the expiry; from that instant the list
 * is ignored.
 */
export const EXTERNAL_APP_STRICT_BINDING_ENV = 'EXTERNAL_APP_STRICT_BINDING';

/** RA-MEDIA-C1-001: apps exempt from the three strict-binding checks. */
export const STRICT_BINDING_EXEMPT_APP_IDS: readonly string[] = Object.freeze([
  'cybershield35',
]);

/** RA-MEDIA-C1-001 expiry: 2026-11-25 23:59 ICT. */
export const STRICT_BINDING_EXEMPTION_EXPIRES_AT = new Date(
  '2026-11-25T23:59:00+07:00'
);

/**
 * `all` (or `1`, `true`, `on`) ends every exemption early. No value relaxes
 * strict binding: an unset, `off` or unknown value keeps the default.
 */
function envForcesStrictForAll() {
  const value = process.env[EXTERNAL_APP_STRICT_BINDING_ENV]
    ?.trim()
    .toLowerCase();
  return value === 'all' || value === '1' || value === 'true' || value === 'on';
}

/** Whether the three strict-binding checks apply to `appId` at `now`. */
export function isExternalAppStrictBinding(
  appId: string,
  now: Date = new Date()
) {
  if (now.getTime() >= STRICT_BINDING_EXEMPTION_EXPIRES_AT.getTime()) {
    return true;
  }
  if (envForcesStrictForAll()) return true;
  return !STRICT_BINDING_EXEMPT_APP_IDS.includes(appId.trim().toLowerCase());
}
