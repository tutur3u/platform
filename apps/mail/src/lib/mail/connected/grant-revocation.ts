import { ConnectedMailError, type MailProvider } from './config';

/**
 * Microsoft identity platform codes that mean the refresh grant itself was
 * revoked or expired. Codes that ask for consent or other user interaction
 * (65001, MFA, Conditional Access, password expiry) or report a disabled or
 * missing account are deliberately absent: they can follow a scope or policy
 * change on our side, or the grant may become usable again, so the stored
 * credentials are kept.
 */
export const MICROSOFT_REVOKED_GRANT_CODES = new Set([
  70000, // The grant is invalid or revoked (not counted for scope wording).
  70008, // The refresh token expired or was revoked.
  50173, // The grant expired because it was revoked (password change or reset).
  700081, // The refresh token reached its maximum lifetime.
  700082, // The refresh token expired because of inactivity.
]);
/** Microsoft suberrors that still describe a dead token rather than an interaction. */
const MICROSOFT_TOKEN_SUBERRORS = new Set(['bad_token', 'token_expired']);

/**
 * The provider refused a refresh because the grant is no longer valid. The
 * account's stored credentials are removed and the user must reconnect.
 */
export class RevokedGrantError extends ConnectedMailError {
  constructor() {
    super(409, 'Mail account access was revoked; reconnect it');
  }
}

function microsoftCodes(body: Record<string, unknown>) {
  const listed = Array.isArray(body.error_codes)
    ? body.error_codes.filter((code) => Number.isInteger(code))
    : [];
  if (listed.length) return listed as number[];
  return typeof body.error_description === 'string'
    ? [...body.error_description.matchAll(/AADSTS(\d{5,7})/gu)].map((match) =>
        Number(match[1])
      )
    : [];
}

function isRevokedMicrosoftGrant(body: Record<string, unknown>) {
  if (
    body.suberror !== undefined &&
    !MICROSOFT_TOKEN_SUBERRORS.has(String(body.suberror))
  )
    return false;
  const codes = microsoftCodes(body);
  if (!codes.length) return false;
  // Every reported code must mean a dead grant; any other code keeps the row.
  if (!codes.every((code) => MICROSOFT_REVOKED_GRANT_CODES.has(code)))
    return false;
  // 70000 also reports scopes the refresh asked for but the user never
  // consented to, which a scope change on our side can cause for every account.
  return !(
    codes.includes(70000) &&
    typeof body.error_description === 'string' &&
    /scope/iu.test(body.error_description)
  );
}

/**
 * Classifies a token endpoint error body. Only HTTP 400 `invalid_grant` counts:
 * network errors, timeouts, 5xx, rate limits, `invalid_client` and any other
 * configuration error never classify as a revoked grant. Google's
 * `invalid_rapt` subtype asks for re-authentication and keeps the row.
 * Microsoft additionally requires codes from
 * {@link MICROSOFT_REVOKED_GRANT_CODES} and no interaction suberror.
 */
export function isRevokedGrant(
  provider: MailProvider,
  status: number,
  body: unknown
) {
  if (status !== 400 || !body || typeof body !== 'object') return false;
  const fields = body as Record<string, unknown>;
  if (fields.error !== 'invalid_grant') return false;
  if (provider === 'google')
    return !(
      fields.error_subtype === 'invalid_rapt' ||
      (typeof fields.error_description === 'string' &&
        /invalid_rapt/u.test(fields.error_description))
    );
  return isRevokedMicrosoftGrant(fields);
}

/**
 * Reads a failed token response and reports whether it proves a revoked grant.
 * The body is parsed for its error fields only and is never logged.
 */
export async function isRevokedGrantResponse(
  provider: MailProvider,
  response: Response
) {
  if (response.status !== 400) {
    await response.body?.cancel();
    return false;
  }
  try {
    return isRevokedGrant(provider, response.status, await response.json());
  } catch {
    return false;
  }
}
