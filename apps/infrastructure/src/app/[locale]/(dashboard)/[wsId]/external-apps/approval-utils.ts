import type {
  ExternalAppRegistration,
  SaveExternalAppPayload,
} from '@tuturuuu/internal-api/infrastructure/apps';

export type ExternalAppApprovalSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseExternalAppApprovalSearchParams(
  searchParams: ExternalAppApprovalSearchParams
) {
  const appId = normalizeAppId(firstValue(searchParams.appId));
  const scopeValues = values(searchParams.scope);
  const validScopes = new Set<string>();
  const invalidScopes = new Set<string>();

  for (const value of scopeValues) {
    const normalized = normalizeScope(value);
    if (normalized) {
      validScopes.add(normalized);
    } else if (value.trim()) {
      invalidScopes.add(value.trim());
    }
  }

  return {
    appId,
    feature: firstValue(searchParams.feature)?.trim() || null,
    invalidScopes: [...invalidScopes].sort((a, b) => a.localeCompare(b)),
    origin: normalizeApprovalOrigin(firstValue(searchParams.origin)),
    requestedScopes: [...validScopes].sort((a, b) => a.localeCompare(b)),
    returnUrl: firstValue(searchParams.returnUrl)?.trim() || null,
    workspaceId: normalizeWorkspaceId(firstValue(searchParams.workspaceId)),
  };
}

export function buildExternalAppApprovalPayload(
  app: ExternalAppRegistration,
  requestedScopes: string[],
  options: {
    requestedOrigin?: string | null;
    requestedWorkspaceId?: string | null;
  } = {}
): {
  approvedScopes: string[];
  approvedOrigins: string[];
  approvedWorkspaceIds: string[];
  missingOrigins: string[];
  missingScopes: string[];
  missingWorkspaceIds: string[];
  payload: SaveExternalAppPayload;
} {
  const approvedScopes = normalizeStringList(app.allowedScopes);
  const approvedOrigins = normalizeStringList(app.origins);
  const approvedWorkspaceIds = normalizeStringList(app.allowedWorkspaceIds);
  const requested = normalizeStringList(requestedScopes);
  const missingScopes = requested.filter(
    (scope) => !scopeIsCovered(scope, approvedScopes)
  );
  const requestedOrigin = options.requestedOrigin
    ? normalizeApprovalOrigin(options.requestedOrigin)
    : null;
  const requestedWorkspaceId = options.requestedWorkspaceId
    ? normalizeWorkspaceId(options.requestedWorkspaceId)
    : null;
  const missingOrigins =
    requestedOrigin && !approvedOrigins.includes(requestedOrigin)
      ? [requestedOrigin]
      : [];
  const missingWorkspaceIds =
    requestedWorkspaceId && !approvedWorkspaceIds.includes(requestedWorkspaceId)
      ? [requestedWorkspaceId]
      : [];
  const allowedScopes = normalizeStringList([
    ...approvedScopes,
    ...missingScopes,
  ]);
  const origins = normalizeStringList([...approvedOrigins, ...missingOrigins]);
  const allowedWorkspaceIds = normalizeStringList([
    ...approvedWorkspaceIds,
    ...missingWorkspaceIds,
  ]);

  return {
    approvedScopes,
    approvedOrigins,
    approvedWorkspaceIds,
    missingOrigins,
    missingScopes,
    missingWorkspaceIds,
    payload: {
      allowedScopes,
      allowedWorkspaceIds,
      displayName: app.displayName,
      enabled: app.enabled,
      id: app.id,
      issueSecret: false,
      origins,
    },
  };
}

export function sanitizeExternalAppApprovalReturnUrl(
  rawReturnUrl: string | null | undefined,
  app: ExternalAppRegistration,
  tuturuuuWebAppUrl = 'https://tuturuuu.com',
  extraAllowedOrigins: string[] = []
) {
  if (!rawReturnUrl?.trim()) return null;

  let returnUrl: URL;
  try {
    returnUrl = new URL(rawReturnUrl);
  } catch {
    return null;
  }

  const allowedOrigins = new Set<string>();
  const platformOrigin = originFromUrl(tuturuuuWebAppUrl);
  if (platformOrigin) allowedOrigins.add(platformOrigin);

  for (const origin of app.origins) {
    const parsedOrigin = originFromUrl(origin);
    if (parsedOrigin) allowedOrigins.add(parsedOrigin);
  }
  for (const origin of extraAllowedOrigins) {
    const parsedOrigin = originFromUrl(origin);
    if (parsedOrigin) allowedOrigins.add(parsedOrigin);
  }

  return allowedOrigins.has(returnUrl.origin) ? returnUrl.toString() : null;
}

function normalizeAppId(value: string | undefined) {
  const appId = value?.trim().toLowerCase();
  return appId && /^[a-z0-9_-]{1,64}$/u.test(appId) ? appId : null;
}

function normalizeScope(value: string) {
  const scope = value.trim().toLowerCase();
  return /^[a-z0-9:*._-]{1,80}$/u.test(scope) ? scope : null;
}

function normalizeWorkspaceId(value: string | undefined) {
  const workspaceId = value?.trim().toLowerCase();
  return workspaceId && /^[a-z0-9][a-z0-9_-]{0,127}$/u.test(workspaceId)
    ? workspaceId
    : null;
}

function normalizeApprovalOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  return originFromUrl(value);
}

function normalizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

function scopeIsCovered(scope: string, allowedScopes: string[]) {
  for (const allowedScope of allowedScopes) {
    if (allowedScope === '*' || allowedScope === scope) return true;
    if (
      allowedScope.endsWith(':*') &&
      scope.startsWith(allowedScope.slice(0, -1))
    ) {
      return true;
    }
  }

  return false;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function values(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function originFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
