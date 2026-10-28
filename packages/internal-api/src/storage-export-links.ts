import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type { WorkspaceStorageExportLinksResponse } from './storage';

export async function exportWorkspaceStorageLinks(
  workspaceId: string,
  payload: {
    path: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceStorageExportLinksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/export-links`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function revokeWorkspaceStorageExportLinks(
  workspaceId: string,
  payload: { path: string },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<{ revoked: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/export-links`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}
