export type CalendarSyncErrorType =
  | 'auth'
  | 'api_limit'
  | 'configuration'
  | 'network'
  | 'not_found'
  | 'access_denied'
  | 'unknown';

export class CalendarProviderSyncError extends Error {
  constructor(
    message: string,
    public readonly syncErrorType: CalendarSyncErrorType
  ) {
    super(message);
  }
}

export function classifyCalendarSyncError(
  error: unknown
): CalendarSyncErrorType {
  if (error instanceof CalendarProviderSyncError) return error.syncErrorType;
  const value = error as {
    code?: unknown;
    message?: string;
    response?: { status?: number; data?: { error?: unknown } };
  } | null;
  const status = value?.response?.status ?? value?.code;
  // Inspect only provider error fields, never headers or OAuth credentials.
  const message =
    `${value?.message ?? ''} ${JSON.stringify(value?.response?.data?.error ?? '')}`.toLowerCase();
  if (
    status === 429 ||
    /ratelimit|rate.limit|quota|resource_exhausted/.test(message)
  )
    return 'api_limit';
  if (
    status === 401 ||
    /invalid_grant|invalid credentials|token.*revoked|insufficient.*(scope|permission)/.test(
      message
    )
  )
    return 'auth';
  if (status === 404 || /not found|notfound/.test(message)) return 'not_found';
  if (status === 403 || /forbidden|access denied/.test(message))
    return 'access_denied';
  if (
    /invalid_request|invalid_client|not configured|unauthorized_client/.test(
      message
    )
  )
    return 'configuration';
  if (
    Number(status) >= 500 ||
    /timeout|timed out|econn|enotfound|etimedout|network/.test(message)
  )
    return 'network';
  return 'unknown';
}
