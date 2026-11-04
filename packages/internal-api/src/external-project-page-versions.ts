import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

function path(workspaceId: string, entryId: string, versionId?: string) {
  const base = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/${encodePathSegment(entryId)}/page-versions`;
  return versionId ? `${base}/${encodePathSegment(versionId)}` : base;
}

export function listWorkspaceExternalProjectPageVersions(
  workspaceId: string,
  entryId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    path(workspaceId, entryId),
    { cache: 'no-store' }
  );
}

export function getWorkspaceExternalProjectPageVersion(
  workspaceId: string,
  entryId: string,
  versionId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    path(workspaceId, entryId, versionId),
    { cache: 'no-store' }
  );
}

export function saveWorkspaceExternalProjectPageVersion(
  workspaceId: string,
  entryId: string,
  payload: { data: unknown; schemaVersion: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    path(workspaceId, entryId),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function publishWorkspaceExternalProjectPageVersion(
  workspaceId: string,
  entryId: string,
  versionId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    `${path(workspaceId, entryId, versionId)}/publish`,
    { method: 'POST', cache: 'no-store' }
  );
}
