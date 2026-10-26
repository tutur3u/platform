// Classifies provider credential failures. Only permanent failures may
// quarantine a credential; transient and systemic failures never do.

export const CALENDAR_OAUTH_REASON_CODES = [
  'google_invalid_grant',
  'google_unauthorized_client',
  'google_access_revoked',
  'microsoft_invalid_grant',
  'microsoft_consent_revoked',
  'microsoft_unauthorized_client',
  'unknown_permanent',
] as const;

export type CalendarOAuthReasonCode =
  (typeof CALENDAR_OAUTH_REASON_CODES)[number];
export type CalendarOAuthProvider = 'google' | 'microsoft';

export type CalendarOAuthFailure =
  | {
      kind: 'permanent';
      reason: CalendarOAuthReasonCode;
      providerCode: string | null;
    }
  // Provider or network trouble: retry, never quarantine.
  | { kind: 'transient'; providerCode: string | null }
  // Our own configuration (client secret, request shape): every account
  // would fail the same way, so quarantining any of them would be wrong.
  | { kind: 'systemic'; providerCode: string | null };

const TRANSIENT_OAUTH_CODES = new Set([
  'server_error',
  'temporarily_unavailable',
  'slow_down',
]);
const SYSTEMIC_OAUTH_CODES = new Set([
  'invalid_client',
  'invalid_request',
  'unsupported_grant_type',
]);
const NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);
// MSAL client-side failures that mean the request never got an answer.
const MSAL_NETWORK_CODES = new Set([
  'network_error',
  'endpoints_resolution_error',
  'post_request_failed',
]);
// Entra ID returns these numbers under invalid_grant/interaction_required.
const MICROSOFT_CONSENT_ERRORS = new Set(['65001', '65004']);
const MICROSOFT_UNAUTHORIZED_ERRORS = new Set(['700016', '7000112']);
const MICROSOFT_THROTTLED_ERRORS = new Set(['50196']);

type ProviderErrorFields = {
  status: number | null;
  oauthCode: string | null;
  // Read only to tell revocation apart; never logged or returned.
  description: string;
  aadsts: string | null;
  subError: string | null;
  networkCode: string | null;
  name: string | null;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStatus(value: unknown): number | null {
  const status = typeof value === 'string' ? Number(value) : value;
  return typeof status === 'number' && Number.isInteger(status) && status >= 100
    ? status
    : null;
}

const OAUTH_CODE_PATTERN = /^[a-z][a-z_]{2,63}$/;

function readProviderError(error: unknown): ProviderErrorFields {
  const value = asRecord(error);
  const response = asRecord(value?.response);
  const data = asRecord(response?.data);
  const message = asString(value?.message) ?? '';
  const errorCode = asString(value?.errorCode);
  const dataCode = asString(data?.error);
  const messageCode = OAUTH_CODE_PATTERN.test(message) ? message : null;
  const rawCode = asString(value?.code);
  const errorNo =
    asString(value?.errorNo) ??
    message.match(/\bAADSTS(\d{5,7})\b/)?.[1] ??
    null;
  return {
    status:
      asStatus(response?.status) ??
      asStatus(value?.status) ??
      asStatus(value?.statusCode) ??
      asStatus(value?.code),
    oauthCode: (errorCode ?? dataCode ?? messageCode)?.toLowerCase() ?? null,
    description:
      `${asString(data?.error_description) ?? ''} ${asString(value?.errorMessage) ?? ''}`.toLowerCase(),
    aadsts: errorNo,
    subError: asString(value?.subError)?.toLowerCase() ?? null,
    networkCode: rawCode && NETWORK_CODES.has(rawCode) ? rawCode : null,
    name: asString(value?.name),
    message: message.toLowerCase(),
  };
}

// The provider's machine-readable code only, safe for logs.
function providerCodeOf(fields: ProviderErrorFields): string | null {
  const parts = [
    fields.oauthCode,
    fields.aadsts ? `AADSTS${fields.aadsts}` : null,
    fields.networkCode,
    fields.status ? `http_${fields.status}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('/') : null;
}

function isTransient(fields: ProviderErrorFields): boolean {
  if (fields.status !== null && (fields.status >= 500 || fields.status === 429))
    return true;
  if (fields.oauthCode && TRANSIENT_OAUTH_CODES.has(fields.oauthCode))
    return true;
  if (fields.oauthCode && MSAL_NETWORK_CODES.has(fields.oauthCode)) return true;
  if (fields.aadsts && MICROSOFT_THROTTLED_ERRORS.has(fields.aadsts))
    return true;
  if (fields.networkCode) return true;
  if (fields.name === 'AbortError' || fields.name === 'TimeoutError')
    return true;
  return /timeout|timed out|fetch failed|socket hang up|network/.test(
    fields.message
  );
}

function googleReason(
  fields: ProviderErrorFields
): CalendarOAuthReasonCode | null {
  switch (fields.oauthCode) {
    case 'invalid_grant':
      return /deleted|disabled|suspended/.test(fields.description)
        ? 'google_access_revoked'
        : 'google_invalid_grant';
    case 'unauthorized_client':
      return 'google_unauthorized_client';
    case 'access_denied':
      return 'google_access_revoked';
    default:
      return null;
  }
}

function microsoftReason(
  fields: ProviderErrorFields
): CalendarOAuthReasonCode | null {
  if (
    (fields.aadsts && MICROSOFT_CONSENT_ERRORS.has(fields.aadsts)) ||
    fields.oauthCode === 'consent_required' ||
    fields.subError === 'consent_required'
  )
    return 'microsoft_consent_revoked';
  if (
    fields.oauthCode === 'unauthorized_client' ||
    (fields.aadsts && MICROSOFT_UNAUTHORIZED_ERRORS.has(fields.aadsts))
  )
    return 'microsoft_unauthorized_client';
  if (
    fields.oauthCode === 'invalid_grant' ||
    fields.oauthCode === 'interaction_required'
  )
    return 'microsoft_invalid_grant';
  return null;
}

/**
 * Classifies a token refresh failure, or a provider call whose credential
 * refresh failed. Returns null when the error is not a credential failure.
 */
export function classifyCalendarOAuthFailure(
  provider: CalendarOAuthProvider,
  error: unknown
): CalendarOAuthFailure | null {
  if (!error || (typeof error !== 'object' && typeof error !== 'string'))
    return null;
  const fields =
    typeof error === 'string'
      ? readProviderError({ message: error })
      : readProviderError(error);
  const providerCode = providerCodeOf(fields);

  if (fields.oauthCode && SYSTEMIC_OAUTH_CODES.has(fields.oauthCode))
    return { kind: 'systemic', providerCode };
  if (isTransient(fields)) return { kind: 'transient', providerCode };

  const reason =
    provider === 'google' ? googleReason(fields) : microsoftReason(fields);
  if (reason) return { kind: 'permanent', reason, providerCode };

  // An OAuth error the token endpoint rejected outright but that we have not
  // seen before. Quarantine it under the catch-all and log its code.
  if (
    fields.oauthCode &&
    !MSAL_NETWORK_CODES.has(fields.oauthCode) &&
    (fields.status === 400 || fields.status === 401)
  )
    return { kind: 'permanent', reason: 'unknown_permanent', providerCode };
  return null;
}
