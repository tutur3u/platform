import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type WorkspaceRoleSummary = {
  id: string;
  name: string;
};

export async function listWorkspaceRoles(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleSummary[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles`,
    {
      cache: 'no-store',
    }
  );
}

export async function listRoleMembers(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    data: WorkspaceUser[];
    count: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload;
}
