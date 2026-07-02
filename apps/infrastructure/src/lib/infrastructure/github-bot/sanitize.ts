import 'server-only';

import type { InfrastructureJsonValue } from '@tuturuuu/internal-api/infrastructure/types';
import { GitHubBotStoreError } from './shared';

const REDACTED_VALUE = '[REDACTED]';
const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const REDACTED_PATH = '[REDACTED_PATH]';
const REDACTED_URL = '[REDACTED_URL]';

const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:access[_-]?token|api[_-]?key|authorization|code|cookie|key|password|refresh[_-]?token|secret|session|token)=)[^&\s]+/giu;
const SENSITIVE_KEY_VALUE_PATTERN =
  /(?<![?&])\b(access[_-]?token|api[_-]?key|authorization|client[_-]?secret|cookie|password|refresh[_-]?token|secret|session|token)\b\s*[:=]\s*("[^"]*"|'[^']*'|Bearer\s+[A-Za-z0-9._~+/=-]+|[^\s,;}\]]+)/giu;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/[^\s)]+|\/home\/[^\s)]+|\/private\/[^\s)]+|[A-Za-z]:\\[^\s)]+)/gu;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/giu;
const HOSTNAME_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|dev|internal|io|local|localhost|net|org|test)\b/giu;

export function sanitizeGitHubBotPublicText(value: unknown, maxLength = 200) {
  if (value == null) {
    return null;
  }

  const sanitized = String(value)
    .replace(
      SENSITIVE_QUERY_PARAM_PATTERN,
      (_match, prefix) => `${prefix}${REDACTED_VALUE}`
    )
    .replace(
      SENSITIVE_KEY_VALUE_PATTERN,
      (_match, key) => `${key}: ${REDACTED_VALUE}`
    )
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_VALUE}`)
    .replace(JWT_PATTERN, REDACTED_VALUE)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(LOCAL_PATH_PATTERN, REDACTED_PATH)
    .replace(URL_PATTERN, REDACTED_URL)
    .replace(HOSTNAME_PATTERN, REDACTED_URL)
    .replace(/\s+/gu, ' ')
    .trim();

  if (!sanitized) {
    return null;
  }

  return sanitized.length > maxLength
    ? `${sanitized.slice(0, Math.max(0, maxLength - 3))}...`
    : sanitized;
}

function sanitizeAuditMetadataValue(value: unknown): InfrastructureJsonValue {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return sanitizeGitHubBotPublicText(value) ?? '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeAuditMetadataValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entry]) => [
          sanitizeGitHubBotPublicText(key, 80) ?? 'field',
          sanitizeAuditMetadataValue(entry),
        ])
    );
  }

  return sanitizeGitHubBotPublicText(value) ?? '';
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown>) {
  return sanitizeAuditMetadataValue(metadata) as Record<
    string,
    InfrastructureJsonValue
  >;
}

export function sanitizeGitHubError(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    const statusMatch = error.message.match(
      /\b(?:status|HTTP)\s*:? ?(\d{3})/iu
    );
    if (statusMatch?.[1]) {
      return `GitHub request failed with status ${statusMatch[1]}`;
    }
  }

  if (
    typeof error === 'object' &&
    error &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return `GitHub request failed with status ${
      (error as { status: number }).status
    }`;
  }

  return 'GitHub request failed';
}
