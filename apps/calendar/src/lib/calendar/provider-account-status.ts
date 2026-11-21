import type { CalendarProviderAccountState } from '@tuturuuu/internal-api/calendar';
import { z } from 'zod';
import { classifyCalendarOAuthFailure } from './oauth-failure';

const httpStatus = z.union([
  z.number().int().min(100).max(599),
  z
    .string()
    .regex(/^[1-5]\d{2}$/)
    .transform(Number),
]);
const providerError = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  cause: z.unknown().optional(),
  error: z.unknown().optional(),
  status: z.unknown().optional(),
  statusCode: z.unknown().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  response: z
    .object({
      status: z.unknown().optional(),
      data: z.unknown().optional(),
    })
    .optional(),
});
const providerResponse = z.object({ error: z.unknown() });
const providerReasons = z.object({
  status: z.string().optional(),
  details: z.array(z.object({ reason: z.string().optional() })).optional(),
  errors: z.array(z.object({ reason: z.string().optional() })).optional(),
});

const scopeReasons = new Set([
  'invalid_scope',
  'insufficientPermissions',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
]);
const quotaReasons = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'quotaExceeded',
  'RATE_LIMIT_EXCEEDED',
  'RESOURCE_EXHAUSTED',
]);
const googleCodes = new Set([
  ...scopeReasons,
  ...quotaReasons,
  'invalid_grant',
  'invalid_client',
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'disabled_client',
  'deleted_client',
  'unsupported_grant_type',
  'accessNotConfigured',
  'SERVICE_DISABLED',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'server_error',
  'temporarily_unavailable',
  'slow_down',
]);
const errorNames = new Set([
  'Error',
  'GaxiosError',
  'FetchError',
  'TypeError',
  'AbortError',
  'TimeoutError',
  'NotSupportedError',
]);

type TransportCategory = 'timeout' | 'dns' | 'tls' | 'abort';
type FailedAccountState = Exclude<CalendarProviderAccountState, 'connected'>;

function transportCategory(
  details: z.infer<typeof providerError> | undefined
): TransportCategory | null {
  const code = details?.code ?? '';
  const message = details?.message?.slice(0, 512) ?? '';
  if (details?.name === 'AbortError' || code === 'ABORT_ERR') return 'abort';
  if (
    details?.name === 'TimeoutError' ||
    /^(?:ETIMEDOUT|ECONNABORTED|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT)$/.test(
      String(code)
    ) ||
    /\b(?:timeout|timed out)\b/i.test(message)
  )
    return 'timeout';
  if (/\b(?:ENOTFOUND|EAI_AGAIN|ENODATA)\b/.test(`${code} ${message}`))
    return 'dns';
  if (
    /\b(?:ERR_TLS_[A-Z_]+|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT)\b/.test(
      `${code} ${message}`
    )
  )
    return 'tls';
  return null;
}

export function inspectCalendarProviderAccountFailure(
  provider: 'google' | 'microsoft',
  error: unknown
) {
  const details = providerError.safeParse(error).data;
  const causes = [error];
  let detail = details;
  for (let depth = 0; depth < 4 && detail; depth++) {
    const cause = detail.cause ?? detail.error;
    if (!cause || causes.includes(cause)) break;
    causes.push(cause);
    detail = providerError.safeParse(cause).data;
  }

  let transient = false;
  let unauthorized = false;
  let upstreamStatus: number | null = null;
  let googleErrorCode: string | null = null;
  let transport: TransportCategory | null = null;
  let errorName: string | null = null;
  const result = (state: FailedAccountState) => ({
    state,
    upstreamStatus,
    googleErrorCode,
    transportCategory: transport,
    errorName,
  });
  for (const cause of causes) {
    const details = providerError.safeParse(cause).data;
    const status =
      httpStatus.safeParse(details?.response?.status).data ??
      httpStatus.safeParse(details?.statusCode).data ??
      httpStatus.safeParse(details?.status).data ??
      httpStatus.safeParse(details?.code).data;
    upstreamStatus ??= status ?? null;
    transport ??= transportCategory(details);
    if (details?.name && errorNames.has(details.name))
      errorName ??= details.name;
    const body = providerResponse.safeParse(details?.response?.data).data
      ?.error;
    const reasons = providerReasons.safeParse(body).data;
    const codes = [
      body,
      ...(reasons?.details?.map(({ reason }) => reason) ?? []),
      ...(reasons?.errors?.map(({ reason }) => reason) ?? []),
      reasons?.status,
      details?.code,
      details?.message,
    ];
    if (provider === 'google') {
      const grantRejected = /^invalid_grant\b/i.test(details?.message ?? '');
      googleErrorCode ??=
        codes.find(
          (code): code is string =>
            typeof code === 'string' && googleCodes.has(code)
        ) ?? (grantRejected ? 'invalid_grant' : null);
    }
    const oauth = classifyCalendarOAuthFailure(provider, cause);
    if (oauth?.kind === 'systemic') return result('configuration');
    if (status === 429 || (status !== undefined && status >= 500)) {
      transient = true;
      continue;
    }
    if (
      codes.some((code) => typeof code === 'string' && scopeReasons.has(code))
    ) {
      return result('scope_required');
    }
    if (status === 410) return result('removed');
    if (
      (oauth?.kind === 'permanent' && oauth.reason !== 'unknown_permanent') ||
      (provider === 'google' &&
        (codes.includes('invalid_grant') ||
          /^(?:invalid_grant\b|No refresh token is set\.?$)/i.test(
            details?.message ?? ''
          )))
    ) {
      return result('reconnect_required');
    }
    transient ||=
      oauth?.kind === 'transient' ||
      transport !== null ||
      (provider === 'google' &&
        codes.some(
          (code) => typeof code === 'string' && quotaReasons.has(code)
        ));
    unauthorized ||= status === 401;
  }
  if (transient) return result('temporarily_unavailable');
  return result(unauthorized ? 'reconnect_required' : 'status_unknown');
}
