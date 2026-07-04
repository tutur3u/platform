import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const EXTERNAL_APP_SECRET_PREFIX = 'EXTERNAL_APP_REGISTRY';

const DEFAULT_ALLOWED_SCOPES = ['external-projects:*'];
const APP_SECRET_PREFIX = 'ttr_app_secret_';

export const FIELD_NAMES = [
  'allowedScopes',
  'allowedWorkspaceIds',
  'createdAt',
  'createdBy',
  'displayName',
  'enabled',
  'origins',
  'secretHash',
  'secretIssuedAt',
  'secretLastFour',
  'updatedAt',
  'updatedBy',
] as const;

export type ExternalAppSecretField = (typeof FIELD_NAMES)[number];

export type SecretRow = {
  name: string;
  value: string | null;
};

export function assertAppId(value: string) {
  const appId = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,64}$/u.test(appId)) {
    throw new Error('invalid_app_id');
  }

  return appId;
}

export function appFieldKey(appId: string, field: ExternalAppSecretField) {
  return `${EXTERNAL_APP_SECRET_PREFIX}:${appId}:${field}`;
}

export function parseAppFieldKey(name: string) {
  if (!name.startsWith(`${EXTERNAL_APP_SECRET_PREFIX}:`)) {
    return null;
  }

  const [, appId, field] = name.split(':');

  if (!appId || !FIELD_NAMES.includes(field as ExternalAppSecretField)) {
    return null;
  }

  return {
    appId,
    field: field as ExternalAppSecretField,
  };
}

export function normalizeOrigin(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeOrigins(values: string[]) {
  const origins = values.map(normalizeOrigin).filter(Boolean) as string[];
  return [...new Set(origins)].sort();
}

export function normalizeScopes(
  values?: string[],
  fallback: string[] = DEFAULT_ALLOWED_SCOPES
) {
  const scopes = (values?.length ? values : fallback)
    .map((scope) => scope.trim())
    .filter((scope) => /^[a-z0-9:*._-]{1,80}$/u.test(scope));

  return [...new Set(scopes)].sort();
}

export function normalizeWorkspaceIds(values?: string[]) {
  const workspaceIds = (values ?? [])
    .map((workspaceId) => workspaceId.trim().toLowerCase())
    .filter((workspaceId) => /^[a-z0-9][a-z0-9_-]{0,127}$/u.test(workspaceId));

  return [...new Set(workspaceIds)].sort();
}

export function parseJsonStringArray(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function generateAppSecret() {
  return `${APP_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashAppSecret(secret: string) {
  return createHash('sha256').update(secret).digest('base64url');
}

export function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}
