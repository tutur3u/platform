import type {
  InternalApiWorkspaceMember,
  InternalApiWorkspaceSummary,
  Workspace,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
export async function listWorkspaces(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceSummary[]>('/api/v1/workspaces', {
    cache: 'no-store',
  });
}

export async function getWorkspace(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Workspace>(
    `/api/workspaces/${encodePathSegment(workspaceId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceMembers(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ members: InternalApiWorkspaceMember[] }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload.members ?? [];
}
