import type { RateLimitAppealDiagnostics } from '@tuturuuu/internal-api';

const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const WORKSPACE_API_PATTERN = new RegExp(
  `/api(?:/v1)?/workspaces/(${UUID_PATTERN})(?:/|$)`,
  'u'
);
const WORKSPACE_PAGE_PATTERN = new RegExp(
  `^/(?:[a-z]{2}/)?(${UUID_PATTERN})(?:/|$)`,
  'u'
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function boundedNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

function boundedBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function boundedStringRecord(
  value: unknown,
  maxEntries: number,
  keyMaxLength: number,
  valueMaxLength: number
) {
  const record = asRecord(value);
  const result: Record<string, string> = {};

  for (const [key, entryValue] of Object.entries(record).slice(0, maxEntries)) {
    const boundedKey = boundedString(key, keyMaxLength);
    const boundedValue = boundedString(entryValue, valueMaxLength);
    if (boundedKey && boundedValue) {
      result[boundedKey] = boundedValue;
    }
  }

  return result;
}

function hasDefinedValue(value: Record<string, unknown>) {
  return Object.values(value).some((entry) => entry !== undefined);
}

function readHeader(
  diagnostics: RateLimitAppealDiagnostics,
  headerName: string
) {
  const headers = diagnostics.headers ?? {};
  const direct = headers[headerName];
  if (direct) {
    return direct;
  }

  const normalizedName = headerName.toLowerCase();
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName
  );
  return match?.[1];
}

export function sanitizeRateLimitAppealDiagnostics(
  value: unknown
): RateLimitAppealDiagnostics {
  const source = asRecord(value);
  const environment = asRecord(source.environment);
  const identity = asRecord(source.identity);
  const limit = asRecord(source.limit);
  const request = asRecord(source.request);

  const sanitized: RateLimitAppealDiagnostics = {
    capturedAt: boundedString(source.capturedAt, 64),
    headers: boundedStringRecord(source.headers, 80, 128, 2048),
  };

  const sanitizedEnvironment = {
    timezone: boundedString(environment.timezone, 128),
    userAgent: boundedString(environment.userAgent, 1024),
  };
  if (hasDefinedValue(sanitizedEnvironment)) {
    sanitized.environment = sanitizedEnvironment;
  }

  const sanitizedIdentity = {
    clientIp: boundedString(identity.clientIp, 512),
    userEmail: boundedString(identity.userEmail, 1280),
    userId: boundedString(identity.userId, 128),
  };
  if (hasDefinedValue(sanitizedIdentity)) {
    sanitized.identity = sanitizedIdentity;
  }

  const sanitizedLimit = {
    callerClass: boundedString(limit.callerClass, 128),
    debugBypass: boundedString(limit.debugBypass, 128),
    limit: boundedString(limit.limit, 128),
    policy: boundedString(limit.policy, 128),
    proxyBlockReason: boundedString(limit.proxyBlockReason, 128),
    remaining: boundedString(limit.remaining, 128),
    reset: boundedString(limit.reset, 128),
    retryAfterSeconds: boundedNumber(limit.retryAfterSeconds),
    retryAttempt: boundedNumber(limit.retryAttempt),
    warning: boundedString(limit.warning, 128),
    willRetry: boundedBoolean(limit.willRetry),
    window: boundedString(limit.window, 128),
  };
  if (hasDefinedValue(sanitizedLimit)) {
    sanitized.limit = sanitizedLimit;
  }

  const sanitizedRequest = {
    maxRetries: boundedNumber(request.maxRetries),
    method: boundedString(request.method, 16),
    originalStatus: boundedNumber(request.originalStatus),
    pagePath: boundedString(request.pagePath, 2048),
    requestPath: boundedString(request.requestPath, 2048),
    responseStatus: boundedNumber(request.responseStatus),
  };
  if (hasDefinedValue(sanitizedRequest)) {
    sanitized.request = sanitizedRequest;
  }

  return sanitized;
}

export function extractWorkspaceIdFromAppealDiagnostics(
  diagnostics: RateLimitAppealDiagnostics
) {
  const requestPath = diagnostics.request?.requestPath;
  const pagePath = diagnostics.request?.pagePath;
  const requestMatch = requestPath
    ? WORKSPACE_API_PATTERN.exec(requestPath)
    : null;
  const pageMatch = pagePath ? WORKSPACE_PAGE_PATTERN.exec(pagePath) : null;

  return (requestMatch?.[1] ?? pageMatch?.[1])?.toLowerCase() ?? null;
}

export function buildRateLimitAppealRowFields(
  diagnostics: RateLimitAppealDiagnostics
) {
  const parsedRetryAfter = Number.parseInt(
    readHeader(diagnostics, 'Retry-After') ?? '',
    10
  );

  return {
    page_path: diagnostics.request?.pagePath ?? null,
    proxy_block_reason:
      diagnostics.limit?.proxyBlockReason ??
      readHeader(diagnostics, 'X-Proxy-Block-Reason') ??
      null,
    rate_limit_policy:
      diagnostics.limit?.policy ??
      readHeader(diagnostics, 'X-RateLimit-Policy') ??
      null,
    rate_limit_window:
      diagnostics.limit?.window ??
      readHeader(diagnostics, 'X-RateLimit-Window') ??
      null,
    request_method: diagnostics.request?.method ?? null,
    request_path: diagnostics.request?.requestPath ?? null,
    response_status: diagnostics.request?.responseStatus ?? null,
    retry_after_seconds:
      diagnostics.limit?.retryAfterSeconds ??
      (Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : null),
    timezone: diagnostics.environment?.timezone ?? null,
    user_agent: diagnostics.environment?.userAgent ?? null,
  };
}
